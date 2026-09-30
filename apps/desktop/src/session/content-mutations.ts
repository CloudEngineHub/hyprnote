import { commands as templateCommands } from "@anlg/plugin-template";

import { executeTransaction } from "~/db";
import { enqueueDatabaseWrite } from "~/db/write-queue";

export type SummaryContentCorrection = {
  id: string;
  currentContent: string;
  currentContentFormat: string;
  nextContent: string;
};

export type TranscriptContentCorrection = {
  id: string;
  currentWordsJson: string;
  currentMemo: string;
  nextWordsJson: string;
  nextMemo: string;
};

export type SessionDocumentContentUpdate = {
  id: string;
  currentContent: string;
  currentContentFormat: string;
  nextContent: string;
};

export type SessionTitleCorrection = {
  currentTitle: string;
  nextTitle: string;
};

export function applySessionContentCorrections({
  sessionId,
  summaries,
  transcripts,
  title,
}: {
  sessionId: string;
  summaries: SummaryContentCorrection[];
  transcripts: TranscriptContentCorrection[];
  title?: SessionTitleCorrection;
}): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const now = new Date().toISOString();
    const statements: Array<{
      sql: string;
      params: unknown[];
      expectedRowsAffected: number;
    }> = [];

    if (title && title.currentTitle !== title.nextTitle) {
      statements.push({
        sql: `
          UPDATE sessions
          SET title = ?, updated_at = ?
          WHERE id = ? AND title = ? AND deleted_at IS NULL
        `,
        params: [title.nextTitle, now, sessionId, title.currentTitle],
        expectedRowsAffected: 1,
      });
    }

    for (const summary of summaries) {
      statements.push({
        sql: `
          UPDATE session_documents
          SET
            body = ?,
            body_format = 'prosemirror_json',
            updated_at = ?
          WHERE id = ?
            AND session_id = ?
            AND kind IN ('summary', 'template_output')
            AND body = ?
            AND body_format = ?
            AND deleted_at IS NULL
        `,
        params: [
          summary.nextContent,
          now,
          summary.id,
          sessionId,
          summary.currentContent,
          summary.currentContentFormat,
        ],
        expectedRowsAffected: 1,
      });
    }

    for (const transcript of transcripts) {
      statements.push({
        sql: `
          UPDATE transcripts
          SET words_json = ?, memo = ?, updated_at = ?
          WHERE id = ?
            AND session_id = ?
            AND words_json = ?
            AND memo = ?
            AND deleted_at IS NULL
        `,
        params: [
          transcript.nextWordsJson,
          transcript.nextMemo,
          now,
          transcript.id,
          sessionId,
          transcript.currentWordsJson,
          transcript.currentMemo,
        ],
        expectedRowsAffected: 1,
      });
    }

    if (statements.length > 0) await executeTransaction(statements);
  });
}

export function persistGeneratedEnhancedNote({
  sessionId,
  ownerUserId,
  note,
  tagNames,
  pendingAutoEnhance,
}: {
  sessionId: string;
  ownerUserId: string;
  note: SessionDocumentContentUpdate;
  tagNames: string[];
  pendingAutoEnhance?: {
    generation: string;
    expectedBody: string;
    expectedContentFormat: string;
  };
}): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const result = await templateCommands.saveGeneratedSummary({
      session_id: sessionId,
      owner_user_id: ownerUserId,
      note_id: note.id,
      current_body: note.currentContent,
      current_body_format: note.currentContentFormat,
      next_body: note.nextContent,
      tag_names: tagNames,
      pending_auto_enhance: pendingAutoEnhance
        ? {
            generation: pendingAutoEnhance.generation,
            expected_body: pendingAutoEnhance.expectedBody,
            expected_body_format: pendingAutoEnhance.expectedContentFormat,
          }
        : null,
    });
    if (result.status === "error") throw new Error(result.error);
  });
}

export function applyGeneratedSessionTitle({
  sessionId,
  currentTitle,
  nextTitle,
  documents,
}: {
  sessionId: string;
  currentTitle: string;
  nextTitle: string;
  documents: SessionDocumentContentUpdate[];
}): Promise<void> {
  return enqueueDatabaseWrite(`session:${sessionId}`, async () => {
    const now = new Date().toISOString();
    const statements: Array<{
      sql: string;
      params: unknown[];
      expectedRowsAffected: number;
    }> = [
      {
        sql: `
          UPDATE sessions
          SET title = ?, updated_at = ?
          WHERE id = ? AND title = ? AND deleted_at IS NULL
        `,
        params: [nextTitle, now, sessionId, currentTitle],
        expectedRowsAffected: 1,
      },
    ];

    for (const document of documents) {
      statements.push({
        sql: `
          UPDATE session_documents
          SET body = ?, body_format = 'prosemirror_json', updated_at = ?
          WHERE id = ?
            AND session_id = ?
            AND kind IN ('note', 'summary', 'template_output')
            AND body = ?
            AND body_format = ?
            AND deleted_at IS NULL
        `,
        params: [
          document.nextContent,
          now,
          document.id,
          sessionId,
          document.currentContent,
          document.currentContentFormat,
        ],
        expectedRowsAffected: 1,
      });
    }

    await executeTransaction(statements);
  });
}
