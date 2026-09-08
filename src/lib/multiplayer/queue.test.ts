import { describe, expect, it } from "vitest";
import { decodeEntry, encodeEntry, isStale, pairingWindow } from "./queue";

/* The window is the only pure decision in matchmaking, and the one whose numbers are
   a judgement rather than a mechanism — so it is the one worth pinning. Everything
   else in that module is Redis commands, which a unit test would only mock back at
   itself. */
describe("pairingWindow", () => {
  it("starts narrow for a settled rating", () => {
    expect(pairingWindow(0, false)).toBe(100);
  });

  it("starts wide for a provisional one, because the number is barely evidence", () => {
    expect(pairingWindow(0, true)).toBe(300);
  });

  it("widens as the wait goes on", () => {
    expect(pairingWindow(30_000, false)).toBe(250);
    expect(pairingWindow(60_000, false)).toBe(400);
  });

  it("stops widening, so a queue of two never pairs 1200 against 2400", () => {
    expect(pairingWindow(10 * 60_000, false)).toBe(500);
    expect(pairingWindow(60 * 60_000, true)).toBe(500);
  });

  it("never narrows over time", () => {
    let previous = 0;
    for (let waited = 0; waited <= 300_000; waited += 5_000) {
      const window = pairingWindow(waited, false);
      expect(window).toBeGreaterThanOrEqual(previous);
      previous = window;
    }
  });
});

/* Both of these pin bugs that were found by hand rather than by test.
   The member string is the queue's entire data model — a sorted set has one score and
   one string per entry, so everything pairing needs is packed in there, and getting
   the packing wrong loses people silently. */
describe("queue entries", () => {
  const entry = {
    userId: "user_abc",
    rating: 1500,
    joinedAt: 1_700_000_000_000,
    seenAt: 1_700_000_030_000,
    provisional: true,
  };

  it("survives a round trip", () => {
    expect(decodeEntry(encodeEntry(entry), 1500)).toEqual(entry);
  });

  it("keeps the join time and the last-seen time apart", () => {
    /* The window widens from `joinedAt`, so a heartbeat must not reset it; staleness is
       measured from `seenAt`, so a heartbeat must refresh that. One field could not do
       both, and using `joinedAt` for staleness swept live players out of the queue
       three minutes after they arrived. */
    const decoded = decodeEntry(encodeEntry(entry), 1500)!;
    expect(decoded.joinedAt).toBe(1_700_000_000_000);
    expect(decoded.seenAt).toBe(1_700_000_030_000);
    expect(decoded.seenAt).not.toBe(decoded.joinedAt);
  });

  it("reads an entry written before `seenAt` existed", () => {
    // A deploy must not orphan whoever was already queued.
    const legacy = decodeEntry("user_abc|1700000000000|1", 1500)!;
    expect(legacy.userId).toBe("user_abc");
    expect(legacy.seenAt).toBe(1_700_000_000_000);
  });

  it("refuses a member string it cannot understand", () => {
    expect(decodeEntry("", 1500)).toBeNull();
    expect(decodeEntry("user_abc", 1500)).toBeNull();
  });

  it("expires on silence, not on patience", () => {
    const now = 1_700_000_060_000;
    // Waiting five minutes while heartbeating is the normal case, not a fault.
    expect(isStale({ ...entry, joinedAt: now - 300_000, seenAt: now - 1_000 }, now)).toBe(
      false,
    );
    // Joined a second ago and already silent: a tab that closed mid-request.
    expect(isStale({ ...entry, joinedAt: now - 1_000, seenAt: now - 60_000 }, now)).toBe(
      true,
    );
  });
});
