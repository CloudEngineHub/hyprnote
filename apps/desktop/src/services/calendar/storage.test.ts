import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeTransaction: vi.fn(),
  id: vi.fn(),
}));

vi.mock("~/db", () => ({
  executeTransaction: mocks.executeTransaction,
  liveQueryClient: { execute: mocks.execute },
}));

vi.mock("~/shared/utils", () => ({
  DEFAULT_USER_ID: "default-user",
  id: mocks.id,
}));

import { syncEvents } from "./process/events";
import { applyConnectionSync, loadEventsForSync } from "./storage";

const ctx = {
  provider: "google" as const,
  connectionId: "conn-work",
  from: new Date("2026-06-01T00:00:00.000Z"),
  to: new Date("2026-06-02T00:00:00.000Z"),
  calendarIds: new Set(["cal-work"]),
  calendarTrackingIdToId: new Map([["primary", "cal-work"]]),
};

describe("calendar SQLite storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.execute.mockResolvedValue([]);
    mocks.executeTransaction.mockResolvedValue([]);
    mocks.id.mockReturnValue("generated-id");
  });

  test("loads tombstoned matching events for durable-id resurrection", async () => {
    mocks.execute.mockResolvedValue([
      {
        id: "event-1",
        tracking_id_event: "tracking-1",
        calendar_id: "cal-work",
        title: "Meeting",
        started_at: "2026-06-01T10:00:00.000Z",
        ended_at: "2026-06-01T11:00:00.000Z",
        location: "",
        meeting_link: "",
        description: "",
        note: "",
        recurrence_series_id: "",
        has_recurrence_rules: 0,
        is_all_day: 0,
        provider: "google",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const rows = await loadEventsForSync(ctx, ["tracking-1"]);

    expect(rows[0]).toMatchObject({
      id: "event-1",
      has_recurrence_rules: false,
      is_all_day: false,
      deleted_at: "2026-05-01T00:00:00.000Z",
    });
  });

  test("commits event, session, human, and participant writes together", async () => {
    await applyConnectionSync({
      ctx,
      events: {
        toDelete: ["event-old"],
        toUpdate: [],
        toAdd: [
          {
            tracking_id_event: "tracking-1",
            tracking_id_calendar: "primary",
            title: "Meeting",
            has_recurrence_rules: false,
            is_all_day: false,
            participants: [{ email: "alice@example.com" }],
          },
        ],
      },
      sessionUpdates: [
        {
          sessionId: "session-1",
          trackingId: "tracking-1",
          calendarId: "cal-work",
          seriesId: "",
          eventJson: "{}",
        },
      ],
      participants: {
        humansToCreate: [
          {
            id: "human-1",
            ownerUserId: "",
            name: "Alice",
            email: "alice@example.com",
            companyName: "Example",
          },
        ],
        humansToEnrich: [
          {
            id: "human-2",
            ownerUserId: "",
            name: "Bob",
            companyName: "Example",
          },
        ],
        toDelete: ["mapping-old"],
        toAdd: [
          {
            sessionId: "session-1",
            humanId: "human-1",
            email: "alice@example.com",
          },
        ],
      },
    });

    expect(mocks.executeTransaction).toHaveBeenCalledTimes(1);
    const statements = mocks.executeTransaction.mock.calls[0][0] as Array<{
      sql: string;
    }>;
    const sql = statements.map((statement) => statement.sql).join("\n");
    expect(sql).not.toContain("DELETE FROM");
  });

  test("normalizes missing optional fields when updating events", async () => {
    const events = syncEvents(ctx, {
      incoming: [
        {
          tracking_id_event: "tracking-1",
          tracking_id_calendar: "primary",
          title: "Updated meeting",
          started_at: "2026-06-01T10:00:00.000Z",
          ended_at: "2026-06-01T11:00:00.000Z",
          location: undefined,
          meeting_link: undefined,
          description: undefined,
          recurrence_series_id: undefined,
          has_recurrence_rules: false,
          is_all_day: false,
        },
      ],
      existing: [
        {
          id: "event-1",
          tracking_id_event: "tracking-1",
          calendar_id: "cal-work",
          title: "Meeting",
          started_at: "2026-06-01T10:00:00.000Z",
          ended_at: "2026-06-01T11:00:00.000Z",
          location: "Room 1",
          meeting_link: "https://meet.example.com/room",
          description: "Description",
          note: "",
          recurrence_series_id: "series-1",
          has_recurrence_rules: false,
          is_all_day: false,
          provider: "google",
          created_at: "2026-01-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
      incomingParticipants: new Map(),
    });

    await applyConnectionSync({
      ctx,
      events,
      sessionUpdates: [],
      participants: {
        humansToCreate: [],
        humansToEnrich: [],
        toDelete: [],
        toAdd: [],
      },
    });

    const statements = mocks.executeTransaction.mock.calls[0][0] as Array<{
      sql: string;
      params: unknown[];
    }>;
    const update = statements.find((statement) =>
      statement.sql.includes("UPDATE events"),
    );
    expect(update?.params.slice(5, 9)).toEqual(["", "", "", ""]);
  });
});
