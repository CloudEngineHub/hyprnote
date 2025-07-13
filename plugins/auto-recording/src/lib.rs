mod commands;
mod error;
mod ext;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use error::Error;
pub use ext::AutoRecordingPluginExt;

const PLUGIN_NAME: &str = "auto-recording";

#[derive(Default)]
pub struct SharedState {
    detector: Option<hypr_meeting_detector::MeetingDetector>,
    active_sessions: HashMap<String, String>,
}

type ManagedState = Mutex<SharedState>;

fn make_specta_builder<R: tauri::Runtime>() -> tauri_specta::Builder<R> {
    tauri_specta::Builder::<R>::new().commands(tauri_specta::collect_commands![
        commands::get_auto_recording_enabled<tauri::Wry>,
        commands::set_auto_recording_enabled<tauri::Wry>,
        commands::get_auto_record_on_scheduled<tauri::Wry>,
        commands::set_auto_record_on_scheduled<tauri::Wry>,
        commands::get_auto_record_on_ad_hoc<tauri::Wry>,
        commands::set_auto_record_on_ad_hoc<tauri::Wry>,
        commands::get_notify_before_meeting<tauri::Wry>,
        commands::set_notify_before_meeting<tauri::Wry>,
        commands::get_require_window_focus<tauri::Wry>,
        commands::set_require_window_focus<tauri::Wry>,
        commands::get_minutes_before_notification<tauri::Wry>,
        commands::set_minutes_before_notification<tauri::Wry>,
        commands::get_auto_stop_on_meeting_end<tauri::Wry>,
        commands::set_auto_stop_on_meeting_end<tauri::Wry>,
        commands::get_detection_confidence_threshold<tauri::Wry>,
        commands::set_detection_confidence_threshold<tauri::Wry>,
        commands::start_auto_recording_monitor<tauri::Wry>,
        commands::stop_auto_recording_monitor<tauri::Wry>,
        commands::get_active_meetings<tauri::Wry>,
    ])
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    let specta_builder = make_specta_builder();

    Builder::new(PLUGIN_NAME)
        .invoke_handler(specta_builder.invoke_handler())
        .setup(|app, _api| {
            app.manage(ManagedState::default());

            let app_handle = app.app_handle().clone();

            // Listen for app initialization complete event
            let _listener = app.listen("app-initialization-complete", move |_event| {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if app_handle.get_auto_recording_enabled().unwrap_or(false) {
                        if let Err(e) = app_handle.start_auto_recording_monitor().await {
                            tracing::error!(
                                "Failed to start auto-recording monitor on startup: {}",
                                e
                            );
                        }
                    }
                });
            });

            Ok(())
        })
        .build()
}

#[cfg(debug_assertions)]
pub fn export_types() -> tauri_specta::Builder<tauri::Wry> {
    make_specta_builder::<tauri::Wry>()
}

async fn handle_ad_hoc_meeting_detected<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    meeting: hypr_meeting_detector::MeetingDetected,
) -> Result<(), Error> {
    if !app.get_auto_record_on_ad_hoc()? {
        return Ok(());
    }

    // Check confidence threshold
    let threshold = app.get_detection_confidence_threshold().unwrap_or(0.7);
    if meeting.confidence < threshold {
        tracing::info!(
            "Meeting confidence ({:.2}) below threshold ({:.2}), skipping auto-recording",
            meeting.confidence,
            threshold
        );
        return Ok(());
    }

    if app.get_notify_before_meeting()? {
        let notification = hypr_notification2::Notification {
            title: "Meeting detected - Click to start recording".to_string(),
            message: format!(
                "Detected {} meeting{}. (Confidence: {:.0}%)",
                meeting.app.name,
                if let Some(ref title) = meeting.window_title {
                    format!(" ({})", title)
                } else {
                    String::new()
                },
                meeting.confidence * 100.0
            ),
            url: Some(format!(
                "hypr://app/new?record=true&source=auto-detected&app={}",
                meeting.app.bundle_id
            )),
            timeout: Some(std::time::Duration::from_secs(15)),
        };
        hypr_notification2::show(notification);

        // Note: Current notification system doesn't support direct callbacks.
        // Recording will only start if user clicks the notification.
        // Consider implementing a state-based confirmation system in the future.
        return Ok(()); // Don't auto-start recording - require user interaction
    }

    app.trigger_recording_for_meeting(meeting.app.bundle_id)
        .await?;
    Ok(())
}

async fn handle_scheduled_meeting_starting<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    meeting: hypr_meeting_detector::ScheduledMeeting,
) -> Result<(), Error> {
    if !app.get_auto_record_on_scheduled()? {
        return Ok(());
    }

    if app.get_notify_before_meeting()? {
        let notification = hypr_notification2::Notification {
            title: "Meeting is about to begin!".to_string(),
            message: format!(
                "'{}' is starting. Preparing to start recording...",
                meeting.title
            ),
            url: Some("hypr://app/new?record=true".to_string()),
            timeout: Some(std::time::Duration::from_secs(15)),
        };
        hypr_notification2::show(notification);
    }

    // Start recording immediately for scheduled meetings
    app.trigger_recording_for_meeting(meeting.id).await?;
    Ok(())
}

async fn handle_scheduled_meeting_ended<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    meeting: hypr_meeting_detector::ScheduledMeeting,
) -> Result<(), Error> {
    // Check if auto-stop is enabled
    if app.get_auto_stop_on_meeting_end().unwrap_or(true) {
        app.stop_recording_for_meeting(meeting.id.clone()).await?;

        let notification = hypr_notification2::Notification {
            title: "Meeting ended".to_string(),
            message: format!("'{}' has ended. Recording stopped.", meeting.title),
            url: Some("hypr://app".to_string()),
            timeout: Some(std::time::Duration::from_secs(8)),
        };
        hypr_notification2::show(notification);
    } else {
        tracing::info!("Meeting ended but auto-stop disabled: {}", meeting.title);
    }
    Ok(())
}

async fn handle_scheduled_meeting_upcoming<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    meeting: hypr_meeting_detector::ScheduledMeeting,
) -> Result<(), Error> {
    // Handle upcoming meeting notifications
    if app.get_notify_before_meeting()? {
        let minutes_before = app.get_minutes_before_notification()?;
        let notification = hypr_notification2::Notification {
            title: format!("Meeting in {} minutes", minutes_before),
            message: format!("'{}' is scheduled to begin soon. Get ready!", meeting.title),
            url: Some("hypr://app/new?record=true".to_string()),
            timeout: Some(std::time::Duration::from_secs(10)),
        };
        hypr_notification2::show(notification);
    }
    Ok(())
}

async fn handle_meeting_app_closed<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    bundle_id: String,
) -> Result<(), Error> {
    tracing::info!("Meeting app closed: {}", bundle_id);
    // Check if auto-stop is enabled before stopping recording
    if app.get_auto_stop_on_meeting_end().unwrap_or(true) {
        app.stop_recording_for_meeting_if_active(bundle_id).await?;
    }
    Ok(())
}

pub async fn handle_meeting_event<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    event: hypr_meeting_detector::MeetingEvent,
) -> Result<(), Error> {
    use hypr_meeting_detector::MeetingEvent;

    match event {
        MeetingEvent::AdHocMeetingDetected(meeting) => {
            handle_ad_hoc_meeting_detected(app, meeting).await
        }
        MeetingEvent::ScheduledMeetingStarting(meeting) => {
            handle_scheduled_meeting_starting(app, meeting).await
        }
        MeetingEvent::ScheduledMeetingEnded(meeting) => {
            handle_scheduled_meeting_ended(app, meeting).await
        }
        MeetingEvent::ScheduledMeetingUpcoming(meeting) => {
            handle_scheduled_meeting_upcoming(app, meeting).await
        }
        MeetingEvent::MeetingAppClosed(bundle_id) => {
            handle_meeting_app_closed(app, bundle_id).await
        }
    }
}

pub async fn get_upcoming_meetings(
    db: &hypr_db_user::UserDatabase,
    user_id: &str,
) -> Result<Vec<hypr_meeting_detector::ScheduledMeeting>, Error> {
    use chrono::{Duration, Utc};

    let now = Utc::now();
    let end_time = now + Duration::hours(24);

    let filter = hypr_db_user::ListEventFilter {
        common: hypr_db_user::ListEventFilterCommon {
            user_id: user_id.to_string(),
            limit: Some(100),
        },
        specific: hypr_db_user::ListEventFilterSpecific::DateRange {
            start: now,
            end: end_time,
        },
    };
    let events = db.list_events(Some(filter)).await?;

    let mut meetings = Vec::new();
    for event in events {
        // Fetch participants from the session associated with this event
        let participants: Vec<String> = match db
            .get_session(hypr_db_user::GetSessionFilter::CalendarEventId(
                event.id.clone(),
            ))
            .await
        {
            Ok(Some(session)) => {
                // Get participants for the session
                let session_id = session.id.clone();
                match db.session_list_participants(session.id).await {
                    Ok(humans) => {
                        // Convert Human objects to string representations
                        humans
                            .into_iter()
                            .map(|human| {
                                if let Some(name) = human.full_name {
                                    name
                                } else if let Some(email) = human.email {
                                    email
                                } else {
                                    human.id
                                }
                            })
                            .collect()
                    }
                    Err(e) => {
                        tracing::warn!(
                            "Failed to fetch participants for session {}: {}",
                            session_id,
                            e
                        );
                        Vec::new()
                    }
                }
            }
            Ok(None) => {
                // No session found for this event
                Vec::new()
            }
            Err(e) => {
                tracing::warn!("Failed to fetch session for event {}: {}", event.id, e);
                Vec::new()
            }
        };

        meetings.push(hypr_meeting_detector::ScheduledMeeting {
            id: event.id,
            title: event.name,
            start_time: event.start_date,
            end_time: event.end_date,
            participants,
            is_upcoming: event.start_date > now,
        });
    }

    Ok(meetings)
}
