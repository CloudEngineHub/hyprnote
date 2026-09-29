import { afterEach, describe, expect, test, vi } from "vitest";

import type { ParticipantSyncSnapshot } from "../../storage";
import { syncSessionParticipants } from "./sync";

import { id } from "~/shared/utils";

vi.mock("~/shared/utils", () => ({
  id: vi.fn(() => "human-new"),
}));

function createSnapshot(
  overrides: Partial<ParticipantSyncSnapshot> = {},
): ParticipantSyncSnapshot {
  return {
    sessions: [],
    humans: [],
    mappings: [],
    ...overrides,
  };
}

const session = {
  id: "session-1",
  ownerUserId: "user-1",
  eventJson: JSON.stringify({ tracking_id: "tracking-1" }),
  trackingId: "tracking-1",
};

describe("syncSessionParticipants", () => {
  afterEach(() => {
    vi.mocked(id).mockReset().mockReturnValue("human-new");
  });

  test("updates participants on every note attached to a reconciled occurrence", () => {
    vi.mocked(id)
      .mockReturnValueOnce("human-one")
      .mockReturnValueOnce("human-two");
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "guest@example.com" }]],
      ]),
      snapshot: createSnapshot({
        sessions: [session, { ...session, id: "session-2" }],
      }),
    });
    expect(result.toAdd.map((mapping) => mapping.sessionId)).toEqual([
      "session-1",
      "session-2",
    ]);
    expect(result.humansToCreate).toHaveLength(1);
    expect(result.toAdd.map((mapping) => mapping.humanId)).toEqual([
      "human-one",
      "human-one",
    ]);
  });

  test("creates a human when the participant email is new", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "new@example.com", name: "New Person" }]],
      ]),
      snapshot: createSnapshot({ sessions: [session] }),
    });

    expect(result.humansToCreate).toEqual([
      {
        id: "human-new",
        ownerUserId: "user-1",
        email: "new@example.com",
        name: "New Person",
        companyName: "Example",
      },
    ]);
    expect(result.humansToEnrich).toEqual([]);
    expect(result.toAdd).toEqual([
      {
        sessionId: "session-1",
        humanId: "human-new",
        email: "new@example.com",
      },
    ]);
  });

  test("uses an existing human when email matches case-insensitively", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "Existing@Example.com", name: "Existing" }]],
      ]),
      snapshot: createSnapshot({
        sessions: [session],
        humans: [
          {
            id: "human-1",
            email: "existing@example.com",
            name: "Existing",
            organizationId: "org-1",
          },
        ],
      }),
    });

    expect(result.humansToCreate).toEqual([]);
    expect(result.toAdd[0]).toMatchObject({ humanId: "human-1" });
  });

  test.each([
    ["auto", ["mapping-1"]],
    ["excluded", []],
  ] as const)(
    "a removed participant with a %s mapping yields deletions %j",
    (source, expected) => {
      const result = syncSessionParticipants({
        incomingParticipants: new Map([["tracking-1", []]]),
        snapshot: createSnapshot({
          sessions: [session],
          humans: [
            {
              id: "human-1",
              email: "removed@example.com",
              name: "",
              organizationId: "",
            },
          ],
          mappings: [
            {
              id: "mapping-1",
              sessionId: "session-1",
              humanId: "human-1",
              source,
            },
          ],
        }),
      });

      expect(result.toDelete).toEqual(expected);
    },
  );

  test("enriches existing humans whose name is missing or an email", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        [
          "tracking-1",
          [
            { email: "alice@acme.com" },
            { email: "bob@acme.com", name: "Bob Builder" },
            { email: "done@acme.com" },
          ],
        ],
      ]),
      snapshot: createSnapshot({
        sessions: [session],
        humans: [
          {
            id: "human-a",
            email: "alice@acme.com",
            name: "alice@acme.com",
            organizationId: "",
          },
          {
            id: "human-b",
            email: "bob@acme.com",
            name: "",
            organizationId: "org-1",
          },
          {
            id: "human-c",
            email: "done@acme.com",
            name: "Done Person",
            organizationId: "org-1",
          },
        ],
      }),
    });

    expect(result.humansToCreate).toEqual([]);
    expect(result.humansToEnrich).toEqual([
      {
        id: "human-a",
        ownerUserId: "user-1",
        name: "Alice",
        companyName: "Acme",
      },
      { id: "human-b", ownerUserId: "user-1", name: "Bob Builder" },
    ]);
  });

  test("never enriches the session owner", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "me@acme.com" }]],
      ]),
      snapshot: createSnapshot({
        sessions: [session],
        humans: [
          { id: "user-1", email: "me@acme.com", name: "", organizationId: "" },
        ],
      }),
    });

    expect(result.humansToEnrich).toEqual([]);
  });

  test("prefers a provider display name over an email-derived one across sessions", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "alice.smith@acme.com" }]],
        [
          "tracking-2",
          [{ email: "alice.smith@acme.com", name: "Dr. Alice Smith" }],
        ],
      ]),
      snapshot: createSnapshot({
        sessions: [
          session,
          { ...session, id: "session-2", trackingId: "tracking-2" },
        ],
        humans: [
          {
            id: "human-a",
            email: "alice.smith@acme.com",
            name: "",
            organizationId: "",
          },
        ],
      }),
    });

    expect(result.humansToEnrich).toEqual([
      {
        id: "human-a",
        ownerUserId: "user-1",
        name: "Dr. Alice Smith",
        companyName: "Acme",
      },
    ]);
  });

  test("upgrades a pending new human's name when a later event provides one", () => {
    const result = syncSessionParticipants({
      incomingParticipants: new Map([
        ["tracking-1", [{ email: "alice.smith@acme.com" }]],
        [
          "tracking-2",
          [{ email: "alice.smith@acme.com", name: "Dr. Alice Smith" }],
        ],
      ]),
      snapshot: createSnapshot({
        sessions: [
          session,
          { ...session, id: "session-2", trackingId: "tracking-2" },
        ],
      }),
    });

    expect(result.humansToCreate).toEqual([
      {
        id: "human-new",
        ownerUserId: "user-1",
        email: "alice.smith@acme.com",
        name: "Dr. Alice Smith",
        companyName: "Acme",
      },
    ]);
  });
});
