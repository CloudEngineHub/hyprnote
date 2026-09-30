const COMMANDS: &[&str] = &[
    "create_session",
    "create_session_for_event",
    "soft_delete_session",
    "restore_deleted_session",
    "add_session_participant",
    "remove_session_participant",
    "persist_chat_session_proposal",
    "set_session_proposal_status",
    "resolve_session_conflicts",
    "resolve_session_conflict",
    "move_session_contents",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
