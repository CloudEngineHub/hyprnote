const COMMANDS: &[&str] = &[
    "available_providers",
    "is_provider_enabled",
    "list_connection_ids",
    "list_calendars",
    "list_events",
    "open_calendar",
    "create_event",
    "apply_calendar_inventory",
    "tombstone_calendar_connection",
    "set_calendar_enabled",
    "update_ignored_calendar_item",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
