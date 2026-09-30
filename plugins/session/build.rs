const COMMANDS: &[&str] = &[
    "create_session",
    "create_session_for_event",
    "soft_delete_session",
    "restore_deleted_session",
    "add_session_participant",
    "remove_session_participant",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
