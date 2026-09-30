import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeTransaction: vi.fn(
    (
      _statements: Array<{
        sql: string;
        params: unknown[];
        expectedRowsAffected?: number;
      }>,
    ) => Promise.resolve([1, 1]),
  ),
  saveGeneratedSummary: vi.fn(
    async (
      _request: unknown,
    ): Promise<
      { status: "ok"; data: null } | { status: "error"; error: string }
    > => ({ status: "ok", data: null }),
  ),
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
}));

vi.mock("@anlg/plugin-template", () => ({
  commands: {
    saveGeneratedSummary: mocks.saveGeneratedSummary,
  },
}));

import {
  applyGeneratedSessionTitle,
  applySessionContentCorrections,
  persistGeneratedEnhancedNote,
} from "./content-mutations";

describe("session content SQLite corrections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guards every summary and transcript update against stale content", async () => {
    await applySessionContentCorrections({
      sessionId: "session-1",
      summaries: [
        {
          id: "summary-1",
          currentContent: "old summary",
          currentContentFormat: "markdown",
          nextContent: '{"type":"doc"}',
        },
      ],
      transcripts: [
        {
          id: "transcript-1",
          currentWordsJson: '[{"text":"X"}]',
          currentMemo: "Speaker: X",
          nextWordsJson: '[{"text":"Y"}]',
          nextMemo: "Speaker: Y",
        },
      ],
    });

    const statements = mocks.executeTransaction.mock.calls[0][0];
    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatchObject({ expectedRowsAffected: 1 });
    expect(statements[0].sql).toContain("body = ?");
    expect(statements[0].sql).toContain("body_format = ?");
    expect(statements[1]).toMatchObject({ expectedRowsAffected: 1 });
    expect(statements[1].sql).toContain("words_json = ?");
    expect(statements[1].sql).toContain("memo = ?");
  });

  it("guards a session title correction against a stale title", async () => {
    await applySessionContentCorrections({
      sessionId: "session-1",
      summaries: [],
      transcripts: [],
      title: {
        currentTitle: "Scratchpad Design and Analog vs Chyle Direction",
        nextTitle: "Scratchpad Design and Anarlog vs Char Direction",
      },
    });

    const statements = mocks.executeTransaction.mock.calls[0][0];
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({
      expectedRowsAffected: 1,
      params: [
        "Scratchpad Design and Anarlog vs Char Direction",
        expect.any(String),
        "session-1",
        "Scratchpad Design and Analog vs Chyle Direction",
      ],
    });
    expect(statements[0].sql).toContain("UPDATE sessions");
    expect(statements[0].sql).toContain("AND title = ?");
  });

  it("rejects when the Rust save fails", async () => {
    mocks.saveGeneratedSummary.mockResolvedValueOnce({
      status: "error",
      error: "database is locked",
    });
    await expect(
      persistGeneratedEnhancedNote({
        sessionId: "session-1",
        ownerUserId: "user-1",
        note: {
          id: "summary-1",
          currentContent: "old summary",
          currentContentFormat: "markdown",
          nextContent: '{"type":"doc"}',
        },
        tagNames: [],
      }),
    ).rejects.toThrow("database is locked");
  });

  it("rolls back a generated title when any document guard is stale", async () => {
    await applyGeneratedSessionTitle({
      sessionId: "session-1",
      currentTitle: "",
      nextTitle: "Planning",
      documents: [
        {
          id: "session-1",
          currentContent: "old note",
          currentContentFormat: "markdown",
          nextContent: '{"type":"doc"}',
        },
      ],
    });

    const statements = mocks.executeTransaction.mock.calls[0][0];
    expect(statements).toHaveLength(2);
    expect(statements[0].sql).toContain("AND title = ?");
    expect(statements[0]).toMatchObject({ expectedRowsAffected: 1 });
    expect(statements[1].sql).toContain("AND body = ?");
    expect(statements[1]).toMatchObject({ expectedRowsAffected: 1 });
  });
});
