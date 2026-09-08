/* ── The wire ─────────────────────────────────────────────────────────────────
   One module imported by both the routes and the browser, so a change to an event
   shape is a type error on both sides rather than a bug that only shows up between
   two people.

   The events carry a sequence number and nothing that cannot be re-derived. That
   is deliberate: the SSE stream is a doorbell, not the source of truth. A client
   that misses an event notices at the next one — its cursor is behind — and
   catches up from the database. Losing a message costs a round trip, not a move.
   ─────────────────────────────────────────────────────────────────────────── */

export type Seat = "white" | "black";
export type GameWinner = "white" | "black" | "draw";
/* One definition, in `chess/types`, because an engine game ends for the same reasons.
   Re-exported so every existing importer of the protocol keeps working. */
export type { GameEnding } from "@/lib/chess/types";
import type { GameEnding } from "@/lib/chess/types";

export function opposite(seat: Seat): Seat {
  return seat === "white" ? "black" : "white";
}

export type PublicPlayer = {
  username: string;
  rating: number;
  /** Provisional while the deviation is still wide — shown as "1500?" rather than
   *  implying a precision the number does not have. */
  provisional: boolean;
};

/** Everything needed to draw the board and the clocks from cold. */
export type GameSnapshot = {
  id: string;
  status: "pending" | "active" | "finished" | "abandoned";
  white: PublicPlayer | null;
  black: PublicPlayer | null;
  /** Which seat *you* are, or null when watching a game you are not in. */
  seat: Seat | null;
  sans: string[];
  /** Ply of the last move; the cursor a client resumes from. */
  seq: number;
  initialMs: number;
  incrementMs: number;
  msLeftWhite: number;
  msLeftBlack: number;
  /** Server time the side on the move started thinking. */
  turnStartedAt: number;
  /** Server time when the snapshot was taken, so a client can correct for the
   *  round trip instead of assuming its own clock agrees. */
  serverNow: number;
  winner: GameWinner | null;
  ending: GameEnding | null;
  offer: { kind: "draw" | "rematch"; by: Seat } | null;
  /** Server time the game ended, or null while it is still going. The rematch
   *  window is measured from it. */
  endedAt: number | null;
  /** The game both players agreed to move to. Set once, when a rematch is accepted,
   *  and the only thing either client needs in order to arrive there together. */
  rematchId: string | null;
  rated: boolean;
  /** Present once a rated game has finished and ratings have been applied. */
  ratings: Record<Seat, { before: number; after: number }> | null;
};

/* Two events, and one of them is a heartbeat.
 *
 * There is no `move`, `joined`, `offer` or `over` event, deliberately. A snapshot
 * already carries all of it, and every one of those would be a second way to learn
 * the same fact — which is a second thing to keep consistent and a second thing to
 * forget to send. An earlier draft of this type declared all four and sent none, so
 * anyone writing a client from the types alone would have handled events that never
 * arrive and missed the one that does. */
export type ServerEvent =
  /** The whole game. Sent on connect, on resume, and whenever anything a client
   *  renders has changed. */
  | { type: "snapshot"; snapshot: GameSnapshot }
  /** Keeps an intermediary from closing an idle stream, and lets the client notice a
   *  dead connection without waiting for a move that may be minutes away. */
  | { type: "ping"; now: number };

export type MoveRequest = {
  from: string;
  to: string;
  promotion?: string;
  /** The ply the client believes it is playing. */
  seq: number;
};

/* ── The rematch window ───────────────────────────────────────────────────────
   A rematch is only offerable for a couple of minutes after the game ends, and the
   number lives here because three places have to agree on it: the button that offers
   one, the route that accepts one, and the event stream that has to stay open long
   enough to deliver it. If they disagreed, the visible failure would be an offer sent
   into a closed stream — the opponent never hears it and the offerer waits forever.

   Two minutes is how long two people who have just finished a game plausibly remain
   at the board. After that the stream closes, the function stops billing, and the
   honest answer is a new game rather than an offer nobody will receive.
   ─────────────────────────────────────────────────────────────────────────── */
export const REMATCH_WINDOW_MS = 120_000;

export type RematchPhase =
  /** Not a finished game you played in, so there is nobody to ask. */
  | "unavailable"
  /** Offerable, and nothing outstanding. */
  | "idle"
  /** You asked; they have not answered. */
  | "offered"
  /** They asked; the answer is yours. */
  | "received"
  /** Agreed — `rematchId` says where. */
  | "agreed"
  /** Too long has passed. Nothing more will be delivered on this game. */
  | "expired";

/**
 * What the rematch affordance should be, from a snapshot alone.
 *
 * A pure function rather than a hook because two components need the same answer —
 * the game-over dialog and the status line under the board — and because getting it
 * wrong is the kind of thing worth pinning with tests rather than clicking through.
 *
 * `now` must be *server* time (the client corrects for skew), since the window is
 * measured against a server-stamped `endedAt`.
 */
export function rematchPhase(
  snapshot: Pick<
    GameSnapshot,
    "status" | "seat" | "white" | "black" | "offer" | "endedAt" | "rematchId"
  >,
  now: number,
): RematchPhase {
  if (snapshot.rematchId) return "agreed";
  // A spectator has no seat to offer from, and an unfinished or never-started game
  // has nothing to rematch.
  if (snapshot.status !== "finished" || !snapshot.seat) return "unavailable";
  if (!snapshot.white || !snapshot.black) return "unavailable";

  /* The window closes on an outstanding offer too, rather than keeping it alive
     until answered. It has to: the stream that would carry the answer shuts at the
     same deadline, so an offer that outlived the window would be one the opponent
     can no longer hear and the offerer would wait on forever. A finished game with
     no `endedAt` cannot be measured at all, so it counts as past. */
  if (snapshot.endedAt === null || now - snapshot.endedAt > REMATCH_WINDOW_MS) {
    return "expired";
  }
  const offer = snapshot.offer?.kind === "rematch" ? snapshot.offer : null;
  if (offer) return offer.by === snapshot.seat ? "offered" : "received";
  return "idle";
}

/**
 * Whether a game's event stream has nothing left to deliver.
 *
 * Shared by the server, which closes the stream on it, and the client, which stops
 * reconnecting to it — and it has to be shared, because `EventSource` treats a clean
 * end of stream as a reason to reconnect. Left to itself the browser would reopen the
 * stream of a finished game every few seconds for as long as the tab was open, and the
 * server would answer each time with a snapshot and another close.
 *
 * Two things arrive *after* the result and so must not close the door early: the
 * ratings, which are a second write, and a rematch offer, which is a second
 * conversation.
 */
export function streamSettled(
  snapshot: Pick<
    GameSnapshot,
    "status" | "rated" | "ratings" | "rematchId" | "endedAt"
  >,
  now: number,
): boolean {
  if (snapshot.status === "abandoned") return true;
  if (snapshot.status !== "finished") return false;
  if (snapshot.rated && snapshot.ratings === null) return false;
  // Agreed: both clients are on their way to the new game and this one is history.
  if (snapshot.rematchId !== null) return true;
  return snapshot.endedAt === null || now - snapshot.endedAt > REMATCH_WINDOW_MS;
}
