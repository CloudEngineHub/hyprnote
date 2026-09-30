mod connection;
mod ignored;
mod inventory;
mod selection;
mod transaction_utils;

pub use connection::{TombstoneCalendarConnectionRequest, tombstone_calendar_connection};
pub use ignored::{UpdateIgnoredCalendarItemRequest, update_ignored_calendar_item};
pub use inventory::{ApplyCalendarInventoryRequest, apply_calendar_inventory};
pub use selection::{SetCalendarEnabledRequest, set_calendar_enabled};

use anlg_calendar_interface::CalendarProviderType;

fn provider_str(provider: CalendarProviderType) -> &'static str {
    match provider {
        CalendarProviderType::Apple => "apple",
        CalendarProviderType::Google => "google",
        CalendarProviderType::Outlook => "outlook",
    }
}
