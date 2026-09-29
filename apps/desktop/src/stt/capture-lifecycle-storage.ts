import { executeTransaction, liveQueryClient } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

export const CAPTURE_LIFECYCLE_SETTING_PREFIX = "capture_lifecycle_pending:";
export const CAPTURE_AUDIO_SAVED_SETTING_PREFIX = "capture_audio_saved:";

export type InheritedCapture = {
  transcriptId: string;
  startedAt: number;
  createdAt: string;
  ownerUserId: string;
  memo: string;
  retainAudio?: boolean;
  provider?: string;
  model?: string;
};

export type CaptureLifecycleMarker = {
  version: 1;
  chunkedAudio?: boolean;
  retainAudio?: boolean;
  phase?: "capturing" | "finalizing";
  sessionId: string;
  transcriptId: string;
  startedAt: number;
  createdAt: string;
  audioOffsetMs: number;
  preserveExistingTranscript: boolean;
  automatic?: boolean;
  preserveExistingAudio?: boolean;
  initialTitle?: string;
  ownerUserId: string;
  memo: string;
  provider?: string;
  model?: string;
  summaryMode?: "regenerate" | "if_empty" | "refresh";
  refreshSummaryAfterRepair?: boolean;
  // Earlier captures whose recovery audio still waits for transcription.
  inheritedCaptures?: InheritedCapture[];
  // The current capture finished; only inherited audio still needs repair.
  inheritedOnly?: boolean;
};

export function saveCaptureLifecycleMarker(
  marker: CaptureLifecycleMarker,
  replaceTranscriptId?: string,
): Promise<void> {
  return enqueueDatabaseWrite(`session:${marker.sessionId}`, async () => {
    const now = new Date().toISOString();
    await executeTransaction([
      {
        sql: `
          INSERT INTO app_settings (id, value_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at
          WHERE json_valid(app_settings.value_json)
            AND json_extract(
              app_settings.value_json,
              '$.transcriptId'
            ) IN (
              json_extract(excluded.value_json, '$.transcriptId'),
              ?
            )
        `,
        params: [
          `${CAPTURE_LIFECYCLE_SETTING_PREFIX}${marker.sessionId}`,
          JSON.stringify(marker),
          now,
          replaceTranscriptId ?? marker.transcriptId,
        ],
        expectedRowsAffected: 1,
      },
    ]);
  });
}

export function clearCaptureLifecycleMarker(
  sessionId: string,
  transcriptId: string,
): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    await executeTransaction([
      {
        sql: `
          DELETE FROM app_settings
          WHERE id = ?
            AND json_valid(value_json)
            AND json_extract(
              CASE
                WHEN json_valid(value_json) THEN value_json
                ELSE '{}'
              END,
              '$.transcriptId'
            ) = ?
        `,
        params: [
          `${CAPTURE_LIFECYCLE_SETTING_PREFIX}${sessionId}`,
          transcriptId,
        ],
        expectedRowsAffected: 1,
      },
    ]);
  });
}

// A stopped capture whose saved audio waits for the user to create the note
// or resume listening.
export function markCaptureAudioSaved(sessionId: string): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    await executeTransaction([
      {
        sql: `
          INSERT INTO app_settings (id, value_json, updated_at)
          VALUES (?, '{}', ?)
          ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
        `,
        params: [
          `${CAPTURE_AUDIO_SAVED_SETTING_PREFIX}${sessionId}`,
          new Date().toISOString(),
        ],
      },
    ]);
  });
}

export function clearCaptureAudioSaved(sessionId: string): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    await executeTransaction([
      {
        sql: "DELETE FROM app_settings WHERE id = ?",
        params: [`${CAPTURE_AUDIO_SAVED_SETTING_PREFIX}${sessionId}`],
      },
    ]);
  });
}

export async function loadCaptureLifecycleMarker(
  sessionId: string,
): Promise<CaptureLifecycleMarker | null> {
  const rows = await liveQueryClient.execute<{ value_json: string }>(
    `
      SELECT value_json
      FROM app_settings
      WHERE id = ?
      LIMIT 1
    `,
    [`${CAPTURE_LIFECYCLE_SETTING_PREFIX}${sessionId}`],
  );
  return parseCaptureLifecycleMarker(rows[0]?.value_json, sessionId);
}

export async function loadCaptureLifecycleMarkers(): Promise<
  CaptureLifecycleMarker[]
> {
  const rows = await liveQueryClient.execute<{
    id: string;
    value_json: string;
  }>(
    `
      SELECT id, value_json
      FROM app_settings
      WHERE id GLOB ?
      ORDER BY updated_at, id
    `,
    [`${CAPTURE_LIFECYCLE_SETTING_PREFIX}*`],
  );
  return rows.flatMap((row) => {
    const sessionId = row.id.slice(CAPTURE_LIFECYCLE_SETTING_PREFIX.length);
    const marker = parseCaptureLifecycleMarker(row.value_json, sessionId);
    return marker ? [marker] : [];
  });
}

function parseCaptureLifecycleMarker(
  value: string | undefined,
  sessionId: string,
): CaptureLifecycleMarker | null {
  if (!value || !sessionId) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CaptureLifecycleMarker>;
    if (
      parsed.version !== 1 ||
      parsed.sessionId !== sessionId ||
      typeof parsed.transcriptId !== "string" ||
      !parsed.transcriptId ||
      typeof parsed.startedAt !== "number" ||
      !Number.isFinite(parsed.startedAt) ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.audioOffsetMs !== "number" ||
      !Number.isFinite(parsed.audioOffsetMs) ||
      typeof parsed.preserveExistingTranscript !== "boolean" ||
      typeof parsed.ownerUserId !== "string" ||
      typeof parsed.memo !== "string"
    ) {
      return null;
    }

    return {
      version: 1,
      ...(typeof parsed.chunkedAudio === "boolean"
        ? { chunkedAudio: parsed.chunkedAudio }
        : {}),
      ...(typeof parsed.retainAudio === "boolean"
        ? { retainAudio: parsed.retainAudio }
        : {}),
      sessionId,
      transcriptId: parsed.transcriptId,
      startedAt: parsed.startedAt,
      createdAt: parsed.createdAt,
      audioOffsetMs: Math.max(0, parsed.audioOffsetMs),
      preserveExistingTranscript: parsed.preserveExistingTranscript,
      ...(typeof parsed.automatic === "boolean"
        ? { automatic: parsed.automatic }
        : {}),
      ...(typeof parsed.preserveExistingAudio === "boolean"
        ? { preserveExistingAudio: parsed.preserveExistingAudio }
        : {}),
      ...(typeof parsed.initialTitle === "string"
        ? { initialTitle: parsed.initialTitle }
        : {}),
      ownerUserId: parsed.ownerUserId,
      memo: parsed.memo,
      ...(parsed.phase === "capturing" || parsed.phase === "finalizing"
        ? { phase: parsed.phase }
        : {}),
      ...(typeof parsed.provider === "string"
        ? { provider: parsed.provider }
        : {}),
      ...(typeof parsed.model === "string" ? { model: parsed.model } : {}),
      ...(parsed.summaryMode === "regenerate" ||
      parsed.summaryMode === "if_empty" ||
      parsed.summaryMode === "refresh"
        ? { summaryMode: parsed.summaryMode }
        : {}),
      ...(parsed.refreshSummaryAfterRepair === true
        ? { refreshSummaryAfterRepair: true }
        : {}),
      ...(parsed.inheritedOnly === true ? { inheritedOnly: true } : {}),
      ...(Array.isArray(parsed.inheritedCaptures)
        ? {
            inheritedCaptures: parsed.inheritedCaptures.flatMap(
              parseInheritedCapture,
            ),
          }
        : {}),
    };
  } catch {
    return null;
  }
}

function parseInheritedCapture(value: unknown): InheritedCapture[] {
  if (typeof value !== "object" || value === null) return [];
  const capture = value as Record<string, unknown>;
  if (
    typeof capture.transcriptId !== "string" ||
    !capture.transcriptId ||
    typeof capture.startedAt !== "number" ||
    !Number.isFinite(capture.startedAt) ||
    typeof capture.createdAt !== "string" ||
    typeof capture.ownerUserId !== "string" ||
    typeof capture.memo !== "string"
  ) {
    return [];
  }
  return [
    {
      transcriptId: capture.transcriptId,
      startedAt: capture.startedAt,
      createdAt: capture.createdAt,
      ownerUserId: capture.ownerUserId,
      memo: capture.memo,
      ...(typeof capture.retainAudio === "boolean"
        ? { retainAudio: capture.retainAudio }
        : {}),
      ...(typeof capture.provider === "string"
        ? { provider: capture.provider }
        : {}),
      ...(typeof capture.model === "string" ? { model: capture.model } : {}),
    },
  ];
}

export function hasAudioAwaitingUser(marker: CaptureLifecycleMarker) {
  return (
    !marker.summaryMode &&
    (marker.chunkedAudio === true ||
      (marker.inheritedCaptures ?? []).length > 0)
  );
}

export function hasPendingZeroRetentionAudio(marker: CaptureLifecycleMarker) {
  return (
    (marker.chunkedAudio === true && marker.retainAudio === false) ||
    (marker.inheritedCaptures ?? []).some(
      (capture) => capture.retainAudio === false,
    )
  );
}
