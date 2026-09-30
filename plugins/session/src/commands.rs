use tauri::Manager;

use crate::{creation, deletion, participants};

macro_rules! session_write_command {
    ($name:ident, $module:ident, $function:ident, $request:ty, $result:ty) => {
        #[tauri::command]
        #[specta::specta]
        pub(crate) async fn $name<R: tauri::Runtime>(
            app: tauri::AppHandle<R>,
            request: $request,
        ) -> Result<$result, String> {
            let runtime = app
                .try_state::<tauri_plugin_db::ManagedState>()
                .map(|state| state.inner().clone())
                .ok_or_else(|| "database is not ready yet".to_string())?;
            let _guard = runtime.synced_write_guard().await;
            $module::$function(runtime.pool(), request).await
        }
    };
}

session_write_command!(
    create_session,
    creation,
    create_session,
    creation::CreateSessionRequest,
    String
);
session_write_command!(
    create_session_for_event,
    creation,
    create_session_for_event,
    creation::CreateEventSessionRequest,
    Option<creation::EventSessionResult>
);
session_write_command!(
    soft_delete_session,
    deletion,
    soft_delete_session,
    deletion::TombstoneSessionRequest,
    Option<deletion::DeletedSessionRow>
);
session_write_command!(
    restore_deleted_session,
    deletion,
    restore_deleted_session,
    deletion::TombstoneSessionRequest,
    deletion::RestoreDeletedSessionOutcome
);
session_write_command!(
    add_session_participant,
    participants,
    add_session_participant,
    participants::AddSessionParticipantRequest,
    ()
);
session_write_command!(
    remove_session_participant,
    participants,
    remove_session_participant,
    participants::RemoveSessionParticipantRequest,
    ()
);
