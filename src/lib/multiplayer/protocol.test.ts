import { describe, expect, it } from "vitest";
import {
  REMATCH_WINDOW_MS,
  rematchPhase,
  streamSettled,
  type GameSnapshot,
  type Seat,
} from "./protocol";

const T = 1_700_000_000_000;

const player = { username: "someone", rating: 1500, provisional: false };

/** A finished game between two people, seen from White's chair. */
function finished(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: "AB12CD",
    status: "finished",
    white: { ...player, username: "white" },
    black: { ...player, username: "black" },
    seat: "white",
    sans: ["e4", "e5"],
    seq: 2,
    initialMs: 600_000,
    incrementMs: 0,
    msLeftWhite: 590_000,
    msLeftBlack: 590_000,
    turnStartedAt: T - 60_000,
    serverNow: T,
    winner: "white",
    ending: "resignation",
    offer: null,
    endedAt: T - 5_000,
    rematchId: null,
    chatSeq: 0,
    rated: false,
    ratings: null,
    ...overrides,
  };
}

const rematchFrom = (by: Seat) => ({ kind: "rematch" as const, by });

/* ── Who may ask for another game, and when ───────────────────────────────────
   Two components render from this and one route enforces it, so the interesting
   cases are pinned here rather than clicked through with two accounts.
   ─────────────────────────────────────────────────────────────────────────── */
describe("rematchPhase", () => {
  it("offers one to a player whose game has just ended", () => {
    expect(rematchPhase(finished(), T)).toBe("idle");
  });

  it("tells the two sides of an offer apart", () => {
    expect(rematchPhase(finished({ offer: rematchFrom("white") }), T)).toBe("offered");
    expect(rematchPhase(finished({ offer: rematchFrom("black") }), T)).toBe("received");
  });

  it("ignores an offer made from the other chair when you are in it", () => {
    // Same offer, other seat: the roles swap and nothing else changes.
    const snapshot = finished({ seat: "black", offer: rematchFrom("black") });
    expect(rematchPhase(snapshot, T)).toBe("offered");
  });

  it("does not confuse a draw offer for a rematch", () => {
    /* The two share a row — one offer per game — so a draw that was never answered
       before a resignation ended the game must not read as a rematch on the way out. */
    const snapshot = finished({ offer: { kind: "draw", by: "black" } });
    expect(rematchPhase(snapshot, T)).toBe("idle");
  });

  it("closes the window, offer or no offer", () => {
    const late = T + REMATCH_WINDOW_MS + 1_000;
    expect(rematchPhase(finished(), late)).toBe("expired");
    /* An outstanding offer expires with the window rather than outliving it: the
       stream that would carry the answer shuts at the same moment. */
    expect(rematchPhase(finished({ offer: rematchFrom("white") }), late)).toBe("expired");
  });

  it("counts an unmeasurable end as past", () => {
    expect(rematchPhase(finished({ endedAt: null }), T)).toBe("expired");
  });

  it("reports agreement whatever else is true", () => {
    // Including past the window: once there is a game to go to, go to it.
    const agreed = finished({ rematchId: "ZZ99ZZ" });
    expect(rematchPhase(agreed, T)).toBe("agreed");
    expect(rematchPhase(agreed, T + REMATCH_WINDOW_MS * 10)).toBe("agreed");
  });

  it("has nothing to offer a spectator, or a game still being played", () => {
    expect(rematchPhase(finished({ seat: null }), T)).toBe("unavailable");
    expect(rematchPhase(finished({ status: "active", endedAt: null }), T)).toBe(
      "unavailable",
    );
    // A game nobody ever joined has no opponent to ask.
    expect(rematchPhase(finished({ black: null }), T)).toBe("unavailable");
  });
});

/* ── When the stream may close ─────────────────────────────────────────────────
   Server and client both read this, and they have to agree: the server stops
   sending on it, and the client stops reconnecting on it. A client that kept
   reconnecting would reopen a finished game's stream every few seconds forever;
   a server that closed too early would swallow the rematch offer.
   ─────────────────────────────────────────────────────────────────────────── */
describe("streamSettled", () => {
  it("keeps a live game open", () => {
    expect(streamSettled(finished({ status: "active", endedAt: null }), T)).toBe(false);
    expect(streamSettled(finished({ status: "pending", endedAt: null }), T)).toBe(false);
  });

  it("keeps a just-finished game open for the rematch window", () => {
    expect(streamSettled(finished(), T)).toBe(false);
    expect(streamSettled(finished(), T + REMATCH_WINDOW_MS + 1)).toBe(true);
  });

  it("waits for ratings that are still being worked out", () => {
    /* A rated game writes its result and its ratings in two statements. Closing
       between them left the dialog saying "working out the new ratings…" for good. */
    const rated = finished({ rated: true, ratings: null });
    expect(streamSettled(rated, T + REMATCH_WINDOW_MS + 1)).toBe(false);
    const settled = finished({
      rated: true,
      ratings: {
        white: { before: 1500, after: 1512 },
        black: { before: 1500, after: 1488 },
      },
    });
    expect(streamSettled(settled, T + REMATCH_WINDOW_MS + 1)).toBe(true);
  });

  it("closes as soon as a rematch is agreed", () => {
    // Both clients are on their way to the new game; this one has nothing left to say.
    expect(streamSettled(finished({ rematchId: "ZZ99ZZ" }), T)).toBe(true);
  });

  it("closes on an abandoned game", () => {
    expect(streamSettled(finished({ status: "abandoned", endedAt: null }), T)).toBe(true);
  });
});
