use sqlx::{QueryBuilder, Sqlite, SqliteConnection};

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct CalendarSyncRow {
    pub id: String,
    pub tracking_id_calendar: String,
    pub name: String,
    pub enabled: bool,
    pub provider: String,
    pub source: String,
    pub color: String,
    pub connection_id: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, sqlx::FromRow)]
pub struct AppSettingRow {
    pub id: String,
    pub value_json: String,
}

const CALENDAR_COLUMNS: &str = "
        id,
        tracking_id_calendar,
        name,
        enabled,
        provider,
        source,
        color,
        connection_id,
        created_at,
        deleted_at";

pub async fn list_provider_calendars(
    conn: &mut SqliteConnection,
    provider: &str,
) -> Result<Vec<CalendarSyncRow>, sqlx::Error> {
    let sql = format!(
        "SELECT{CALENDAR_COLUMNS}
      FROM calendars
      WHERE provider = ?
      ORDER BY created_at, id"
    );
    sqlx::query_as::<_, CalendarSyncRow>(sqlx::AssertSqlSafe(sql))
        .bind(provider)
        .fetch_all(&mut *conn)
        .await
}

pub async fn soft_delete_calendar(
    conn: &mut SqliteConnection,
    now: &str,
    calendar_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE calendars
          SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(calendar_id)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn tombstone_events_for_calendars(
    conn: &mut SqliteConnection,
    now: &str,
    calendar_ids: &[String],
) -> Result<u64, sqlx::Error> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        "UPDATE events
        SET deleted_at = ",
    );
    builder.push_bind(now);
    builder.push(", updated_at = ");
    builder.push_bind(now);
    builder.push(
        "
        WHERE deleted_at IS NULL
          AND calendar_id IN (",
    );
    let mut separated = builder.separated(", ");
    for calendar_id in calendar_ids {
        separated.push_bind(calendar_id);
    }
    builder.push(")");
    let result = builder.build().execute(&mut *conn).await?;
    Ok(result.rows_affected())
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_inventory_calendar(
    conn: &mut SqliteConnection,
    id: &str,
    tracking_id_calendar: &str,
    name: &str,
    provider: &str,
    source: &str,
    color: &str,
    connection_id: &str,
    created_at: &str,
    now: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO calendars (
            id,
            tracking_id_calendar,
            name,
            enabled,
            provider,
            source,
            color,
            connection_id,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET
            tracking_id_calendar = excluded.tracking_id_calendar,
            name = excluded.name,
            enabled = CASE
              WHEN calendars.deleted_at IS NULL THEN calendars.enabled
              ELSE 0
            END,
            provider = excluded.provider,
            source = excluded.source,
            color = excluded.color,
            connection_id = excluded.connection_id,
            updated_at = excluded.updated_at,
            deleted_at = NULL",
    )
    .bind(id)
    .bind(tracking_id_calendar)
    .bind(name)
    .bind(provider)
    .bind(source)
    .bind(color)
    .bind(connection_id)
    .bind(created_at)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn tombstone_connection_events(
    conn: &mut SqliteConnection,
    now: &str,
    provider: &str,
    connection_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE events
        SET deleted_at = ?, updated_at = ?
        WHERE deleted_at IS NULL
          AND calendar_id IN (
            SELECT id
            FROM calendars
            WHERE provider = ?
              AND connection_id = ?
              AND deleted_at IS NULL
          )",
    )
    .bind(now)
    .bind(now)
    .bind(provider)
    .bind(connection_id)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn tombstone_connection_calendars(
    conn: &mut SqliteConnection,
    now: &str,
    provider: &str,
    connection_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE calendars
        SET deleted_at = ?, updated_at = ?
        WHERE provider = ?
          AND connection_id = ?
          AND deleted_at IS NULL",
    )
    .bind(now)
    .bind(now)
    .bind(provider)
    .bind(connection_id)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn update_calendar_enabled(
    conn: &mut SqliteConnection,
    enabled: bool,
    now: &str,
    calendar_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE calendars
          SET enabled = ?, updated_at = ?
          WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(enabled)
    .bind(now)
    .bind(calendar_id)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn tombstone_events_when_calendar_disabled(
    conn: &mut SqliteConnection,
    now: &str,
    calendar_id: &str,
    enabled: bool,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE events
          SET deleted_at = ?, updated_at = ?
          WHERE calendar_id = ? AND deleted_at IS NULL AND ? = 0",
    )
    .bind(now)
    .bind(now)
    .bind(calendar_id)
    .bind(enabled)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn list_app_setting_rows(
    conn: &mut SqliteConnection,
    ids: &[&str],
) -> Result<Vec<AppSettingRow>, sqlx::Error> {
    let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
        "SELECT id, value_json
          FROM app_settings
          WHERE id IN (",
    );
    {
        let mut separated = builder.separated(", ");
        for id in ids {
            separated.push_bind(*id);
        }
    }
    builder.push(")");
    builder
        .build_query_as::<AppSettingRow>()
        .fetch_all(&mut *conn)
        .await
}

pub async fn update_app_setting_value(
    conn: &mut SqliteConnection,
    id: &str,
    next_json: &str,
    now: &str,
    expected_json: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE app_settings
                SET value_json = ?, updated_at = ?
                WHERE id = ? AND value_json = ?",
    )
    .bind(next_json)
    .bind(now)
    .bind(id)
    .bind(expected_json)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}

pub async fn insert_app_setting(
    conn: &mut SqliteConnection,
    id: &str,
    next_json: &str,
    now: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO app_settings (id, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO NOTHING",
    )
    .bind(id)
    .bind(next_json)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    Ok(result.rows_affected())
}
