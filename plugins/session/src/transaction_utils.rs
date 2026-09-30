use chrono::SecondsFormat;

pub(crate) fn js_iso8601_timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
