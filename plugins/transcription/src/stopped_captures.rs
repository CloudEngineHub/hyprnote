use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex},
};

use crate::api::StoppedCapture;

#[derive(Clone, Default)]
pub struct StoppedCaptureRegistry(Arc<StdMutex<HashMap<String, StoppedCapture>>>);

impl StoppedCaptureRegistry {
    pub fn record(&self, stopped_capture: StoppedCapture) {
        let mut captures = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let should_replace = captures
            .get(&stopped_capture.session_id)
            .is_none_or(|current| stopped_capture.stopped_at_ms >= current.stopped_at_ms);
        if should_replace {
            captures.insert(stopped_capture.session_id.clone(), stopped_capture);
        }
    }

    pub fn get(&self, session_id: &str) -> Option<StoppedCapture> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(session_id)
            .cloned()
    }

    pub fn list(&self) -> Vec<StoppedCapture> {
        let mut captures = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .values()
            .cloned()
            .collect::<Vec<_>>();
        captures.sort_by_key(|capture| (capture.stopped_at_ms, capture.session_id.clone()));
        captures
    }

    pub fn acknowledge(&self, session_id: &str, stopped_at_ms: i64) {
        let mut captures = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if captures
            .get(session_id)
            .is_some_and(|capture| capture.stopped_at_ms == stopped_at_ms)
        {
            captures.remove(session_id);
        }
    }

    pub fn clear_session(&self, session_id: &str) {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(session_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stopped_capture(stopped_at_ms: i64) -> StoppedCapture {
        StoppedCapture {
            session_id: "session".to_string(),
            stopped_at_ms,
            duration_seconds: 12.0,
            chunked_audio: true,
            audio_path: Some("/tmp/session.wav".to_string()),
            requested_live_transcription: true,
            live_transcription_active: true,
            error: None,
        }
    }

    #[test]
    fn stale_acknowledgement_keeps_newer_stop_and_matching_ack_removes_it() {
        let registry = StoppedCaptureRegistry::default();
        registry.record(stopped_capture(100));
        registry.record(stopped_capture(200));

        registry.acknowledge("session", 100);
        assert_eq!(registry.get("session"), Some(stopped_capture(200)));

        registry.acknowledge("session", 200);
        assert_eq!(registry.get("session"), None);
    }
}
