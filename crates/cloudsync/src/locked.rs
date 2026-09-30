#![allow(unsafe_code)]

use std::ffi::{CStr, CString, c_char};
use std::ptr::{self, NonNull};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, TryRecvError, sync_channel};
use std::time::Duration;

use libsqlite3_sys::{
    SQLITE_DONE, SQLITE_INTERRUPT, SQLITE_NULL, SQLITE_OK, SQLITE_ROW, SQLITE_TRANSIENT, sqlite3,
    sqlite3_bind_int64, sqlite3_bind_text, sqlite3_column_bytes, sqlite3_column_text,
    sqlite3_column_type, sqlite3_errmsg, sqlite3_extended_errcode, sqlite3_finalize,
    sqlite3_interrupt, sqlite3_prepare_v2, sqlite3_step, sqlite3_stmt,
};
use sqlx::SqliteConnection;

use crate::error::Error;

pub(crate) enum RawArg {
    Text(String),
    Int(i64),
}

#[derive(Clone, Copy)]
struct SendDb(NonNull<sqlite3>);

unsafe impl Send for SendDb {}

struct WorkerFence {
    rx: Receiver<()>,
    db: SendDb,
    cancelled: Arc<AtomicBool>,
}

impl Drop for WorkerFence {
    fn drop(&mut self) {
        match self.rx.try_recv() {
            Err(TryRecvError::Empty) => {
                self.cancelled.store(true, Ordering::SeqCst);
                loop {
                    unsafe { sqlite3_interrupt(self.db.0.as_ptr()) };
                    match self.rx.recv_timeout(Duration::from_millis(10)) {
                        Err(RecvTimeoutError::Timeout) => {}
                        Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                    }
                }
            }
            Ok(()) | Err(TryRecvError::Disconnected) => {}
        }
    }
}

pub(crate) async fn execute_on_locked_handle(
    connection: &mut SqliteConnection,
    sql: &'static str,
    args: Vec<RawArg>,
) -> Result<Option<String>, Error> {
    let mut handle = connection.lock_handle().await?;
    let db = SendDb(handle.as_raw_handle());
    let (done_tx, done_rx) = sync_channel::<()>(1);
    let cancelled = Arc::new(AtomicBool::new(false));
    let fence = WorkerFence {
        rx: done_rx,
        db,
        cancelled: Arc::clone(&cancelled),
    };
    let worker_cancelled = Arc::clone(&cancelled);

    let worker = tokio::task::spawn_blocking(move || {
        let _done = done_tx;
        unsafe { step_to_completion(db, sql, &args, &worker_cancelled) }
    });

    let result = match worker.await {
        Ok(result) => result,
        Err(error) if error.is_panic() => std::panic::resume_unwind(error.into_panic()),
        Err(error) => Err(Error::Io(std::io::Error::other(error))),
    };

    drop(fence);
    drop(handle);
    result
}

unsafe fn step_to_completion(
    db: SendDb,
    sql: &'static str,
    args: &[RawArg],
    cancelled: &AtomicBool,
) -> Result<Option<String>, Error> {
    if cancelled.load(Ordering::SeqCst) {
        return Err(interrupted_error());
    }

    let sql = CString::new(sql)
        .map_err(|error| Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, error)))?;
    let mut statement: *mut sqlite3_stmt = ptr::null_mut();
    let prepare_result = unsafe {
        sqlite3_prepare_v2(
            db.0.as_ptr(),
            sql.as_ptr(),
            -1,
            &mut statement,
            ptr::null_mut(),
        )
    };

    let result = if prepare_result != SQLITE_OK {
        Err(sqlite_error(&db))
    } else if statement.is_null() {
        Err(Error::Io(std::io::Error::other(
            "SQLite prepared an empty statement",
        )))
    } else {
        (|| -> Result<Option<String>, Error> {
            for (index, arg) in args.iter().enumerate() {
                let index = i32::try_from(index + 1).map_err(|error| {
                    Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, error))
                })?;

                let bind_result = match arg {
                    RawArg::Text(value) => {
                        let length = i32::try_from(value.len()).map_err(|error| {
                            Error::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, error))
                        })?;
                        unsafe {
                            sqlite3_bind_text(
                                statement,
                                index,
                                value.as_ptr().cast::<c_char>(),
                                length,
                                SQLITE_TRANSIENT(),
                            )
                        }
                    }
                    RawArg::Int(value) => unsafe { sqlite3_bind_int64(statement, index, *value) },
                };

                if bind_result != SQLITE_OK {
                    return Err(sqlite_error(&db));
                }
            }

            if cancelled.load(Ordering::SeqCst) {
                return Err(interrupted_error());
            }

            let mut first_column = None;
            let mut saw_first_row = false;
            loop {
                match unsafe { sqlite3_step(statement) } {
                    SQLITE_ROW => {
                        if !saw_first_row {
                            saw_first_row = true;
                            first_column = unsafe { first_column_text(statement, &db) }?;
                        }
                    }
                    SQLITE_DONE => return Ok(first_column),
                    _ => return Err(sqlite_error(&db)),
                }
            }
        })()
    };

    if !statement.is_null() {
        let _ = unsafe { sqlite3_finalize(statement) };
    }

    result
}

fn interrupted_error() -> Error {
    Error::Sqlite {
        code: SQLITE_INTERRUPT,
        message: "interrupted".into(),
    }
}

unsafe fn first_column_text(
    statement: *mut sqlite3_stmt,
    db: &SendDb,
) -> Result<Option<String>, Error> {
    if unsafe { sqlite3_column_type(statement, 0) } == SQLITE_NULL {
        return Ok(None);
    }

    let text = unsafe { sqlite3_column_text(statement, 0) };
    if text.is_null() {
        return Err(sqlite_error(db));
    }
    let length = unsafe { sqlite3_column_bytes(statement, 0) } as usize;
    let bytes = unsafe { std::slice::from_raw_parts(text.cast::<u8>(), length) }.to_vec();

    String::from_utf8(bytes).map(Some).map_err(|error| {
        Error::Sqlx(sqlx::Error::ColumnDecode {
            index: "0".to_string(),
            source: error.into(),
        })
    })
}

fn sqlite_error(db: &SendDb) -> Error {
    unsafe {
        Error::Sqlite {
            code: sqlite3_extended_errcode(db.0.as_ptr()),
            message: CStr::from_ptr(sqlite3_errmsg(db.0.as_ptr()))
                .to_string_lossy()
                .into_owned(),
        }
    }
}
