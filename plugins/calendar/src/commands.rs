use anlg_calendar_interface::{
    CalendarEvent, CalendarListItem, CalendarProviderType, CreateEventInput, EventFilter,
};
use tauri::Manager;
use tauri_plugin_auth::AuthPluginExt;
#[cfg(target_os = "macos")]
use tauri_plugin_permissions::PermissionsPluginExt;

use crate::error::Error;

#[tauri::command]
#[specta::specta]
pub fn available_providers() -> Vec<CalendarProviderType> {
    anlg_calendar::available_providers()
}

#[tauri::command]
#[specta::specta]
pub async fn is_provider_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
) -> Result<bool, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = match provider {
        CalendarProviderType::Apple => None,
        _ => access_token(&app)?,
    };
    let apple = is_apple_authorized(&app).await?;
    anlg_calendar::is_provider_enabled(&config.api_base_url, token.as_deref(), apple, provider)
        .await
        .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub async fn list_connection_ids<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<anlg_calendar::ProviderConnectionIds>, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = access_token(&app)?;
    let apple = is_apple_authorized(&app).await?;
    anlg_calendar::list_connection_ids(&config.api_base_url, token.as_deref(), apple)
        .await
        .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub async fn list_calendars<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: String,
) -> Result<Vec<CalendarListItem>, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = match provider {
        CalendarProviderType::Apple => String::new(),
        _ => require_access_token(&app)?,
    };
    anlg_calendar::list_calendars(&config.api_base_url, &token, provider, &connection_id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub async fn list_events<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    connection_id: String,
    filter: EventFilter,
) -> Result<Vec<CalendarEvent>, Error> {
    let config = app.state::<crate::PluginConfig>();
    let token = match provider {
        CalendarProviderType::Apple => String::new(),
        _ => require_access_token(&app)?,
    };
    anlg_calendar::list_events(
        &config.api_base_url,
        &token,
        provider,
        &connection_id,
        filter,
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn open_calendar<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
) -> Result<(), Error> {
    anlg_calendar::open_calendar(provider).map_err(Into::into)
}

#[tauri::command]
#[specta::specta]
pub fn create_event<R: tauri::Runtime>(
    _app: tauri::AppHandle<R>,
    provider: CalendarProviderType,
    input: CreateEventInput,
) -> Result<String, Error> {
    anlg_calendar::create_event(provider, input).map_err(Into::into)
}

fn access_token<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<Option<String>, Error> {
    app.access_token()
        .map(|token| token.filter(|token| !token.is_empty()))
        .map_err(|error| Error::Auth(error.to_string()))
}

fn require_access_token<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<String, Error> {
    let token = access_token(app)?;
    match token {
        Some(t) if !t.is_empty() => Ok(t),
        _ => Err(anlg_calendar::Error::NotAuthenticated.into()),
    }
}

async fn is_apple_authorized<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, Error> {
    #[cfg(target_os = "macos")]
    {
        let status = app
            .permissions()
            .check(tauri_plugin_permissions::Permission::Calendar)
            .await
            .map_err(|e| anlg_calendar::Error::Api(e.to_string()))?;
        Ok(matches!(
            status,
            tauri_plugin_permissions::PermissionStatus::Authorized
        ))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn apply_calendar_inventory<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::storage::ApplyCalendarInventoryRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::storage::apply_calendar_inventory(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn tombstone_calendar_connection<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::storage::TombstoneCalendarConnectionRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::storage::tombstone_calendar_connection(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_calendar_enabled<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::storage::SetCalendarEnabledRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::storage::set_calendar_enabled(runtime.pool(), request).await
}

#[tauri::command]
#[specta::specta]
pub async fn update_ignored_calendar_item<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: crate::storage::UpdateIgnoredCalendarItemRequest,
) -> Result<(), String> {
    let runtime = app
        .try_state::<tauri_plugin_db::ManagedState>()
        .map(|state| state.inner().clone())
        .ok_or_else(|| "database is not ready yet".to_string())?;
    let _guard = runtime.synced_write_guard().await;
    crate::storage::update_ignored_calendar_item(runtime.pool(), request).await
}
