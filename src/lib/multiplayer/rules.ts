import { Chess } from "chess.js";
import type { GameEnding, GameWinner, Seat } from "./protocol";

/* ── The rules, decided on the server ─────────────────────────────────────────
   Single player trusts the browser because the only person it could cheat is the
   person running it. Online, everything here has to be decided somewhere the
   players cannot reach: whether a move is legal, whose turn it is, how much time
   each side has left, and whether the game is over.

   Every function is pure. Given the move list and a candidate, the answer is the
   same on the server, in a test, and in the client's optimistic guess — which is
   what lets the client draw a move immediately and still be corrected.
   ─────────────────────────────────────────────────────────────────────────── */

export type StoredMove = {
  seq: number;
  san: string;
  msLeftWhite: number;
  msLeftBlack: number;
  playedAt: number;
};

export type ClockState = {
  initialMs: number;
  incrementMs: number;
};

export type Position = {
  board: Chess;
  /** Whose turn it is, by the rules of chess rather than by whose turn we think. */
  turn: Seat;
  /** Plies played. The next move's `seq`. */
  ply: number;
};

/** Replays a move list into a position. Throws only if the log itself is corrupt,
 *  which would mean a bug rather than a bad request — the server wrote it. */
export function replay(sans: string[]): Position {
  const board = new Chess();
  for (const san of sans) board.move(san);
  return {
    board,
    turn: board.turn() === "w" ? "white" : "black",
    ply: sans.length,
  };
}

export type RejectReason =
  | "not-your-turn"
  | "illegal-move"
  | "out-of-sequence"
  | "game-not-active"
  | "flagged";

export type MoveVerdict =
  | {
      ok: true;
      san: string;
      uci: string;
      fenAfter: string;
      seq: number;
      msLeftWhite: number;
      msLeftBlack: number;
      playedAt: number;
      /** Set when this move ended the game. */
      ending: { winner: GameWinner; ending: GameEnding } | null;
    }
  | { ok: false; reason: RejectReason };

/**
 * Judges one submitted move against the stored log.
 *
 * `expectedSeq` is the client's claim about where it thinks the game is. Requiring
 * it makes the endpoint idempotent in the useful direction: a retry after a lost
 * response arrives with a sequence that has already been used and is refused as
 * out-of-sequence, rather than being played a second time.
 */
export function judgeMove(input: {
  sans: string[];
  clock: ClockState;
  seat: Seat;
  from: string;
  to: string;
  promotion?: string;
  expectedSeq: number;
  /** Server time. A parameter so tests are not at the mercy of the wall clock. */
  now: number;
  /** When the side on the move started thinking: the previous move's timestamp,
   *  or the game's start for the first move. */
  turnStartedAt: number;
  last: StoredMove | null;
}): MoveVerdict {
  const { sans, clock, seat, from, to, promotion, expectedSeq, now, turnStartedAt, last } =
    input;

  const position = replay(sans);
  if (expectedSeq !== position.ply + 1) return { ok: false, reason: "out-of-sequence" };
  if (position.turn !== seat) return { ok: false, reason: "not-your-turn" };

  /* The clock is checked before the move is applied. A player whose time ran out
     while they were deciding does not get to play the move they were deciding on,
     even if it arrives a millisecond later. */
  const before = remaining(clock, last);
  const spent = Math.max(0, now - turnStartedAt);
  if (clock.initialMs > 0 && before[seat] - spent <= 0) {
    return { ok: false, reason: "flagged" };
  }

  let move;
  try {
    move = position.board.move({ from, to, promotion });
  } catch {
    return { ok: false, reason: "illegal-move" };
  }

  const msLeft = { ...before };
  if (clock.initialMs > 0) {
    msLeft[seat] = before[seat] - spent + clock.incrementMs;
  }

  return {
    ok: true,
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    fenAfter: position.board.fen(),
    seq: expectedSeq,
    msLeftWhite: Math.round(msLeft.white),
    msLeftBlack: Math.round(msLeft.black),
    playedAt: now,
    ending: endingOf(position.board),
  };
}

/** Remaining time for both sides as of the last stored move, or the start. */
export function remaining(
  clock: ClockState,
  last: StoredMove | null,
): Record<Seat, number> {
  if (last) return { white: last.msLeftWhite, black: last.msLeftBlack };
  return { white: clock.initialMs, black: clock.initialMs };
}

/**
 * Live remaining time, projecting the thinking side's clock forward to `now`.
 *
 * The client renders this between updates and the server uses it to adjudicate a
 * flag claim, so they agree by construction — the alternative is a client that
 * shows 0:00 while the server still thinks there is a second left.
 */
export function liveRemaining(input: {
  clock: ClockState;
  /** Banked time, as of the last move. `remaining()` produces it. */
  banked: Record<Seat, number>;
  turn: Seat;
  turnStartedAt: number;
  now: number;
}): Record<Seat, number> {
  const { clock, banked, turn, turnStartedAt, now } = input;
  if (clock.initialMs === 0) return banked;
  return {
    ...banked,
    [turn]: Math.max(0, banked[turn] - Math.max(0, now - turnStartedAt)),
  };
}

/** The side that has run out of time, or null. */
export function flagged(input: {
  clock: ClockState;
  last: StoredMove | null;
  turn: Seat;
  turnStartedAt: number;
  now: number;
}): Seat | null {
  const { clock, last, ...rest } = input;
  if (clock.initialMs === 0) return null;
  const live = liveRemaining({ clock, banked: remaining(clock, last), ...rest });
  return live[rest.turn] <= 0 ? rest.turn : null;
}

/** Why a position is over, from the position alone. */
export function endingOf(board: Chess): { winner: GameWinner; ending: GameEnding } | null {
  if (!board.isGameOver()) return null;
  if (board.isCheckmate()) {
    // The side to move is the one that has been mated.
    return { winner: board.turn() === "w" ? "black" : "white", ending: "checkmate" };
  }
  if (board.isStalemate()) return { winner: "draw", ending: "stalemate" };
  if (board.isInsufficientMaterial()) {
    return { winner: "draw", ending: "insufficient-material" };
  }
  if (board.isThreefoldRepetition()) return { winner: "draw", ending: "threefold" };
  return { winner: "draw", ending: "fifty-move" };
}

/** The result of a flag fall: whoever still has time wins. */
export function timeoutResult(loser: Seat): { winner: GameWinner; ending: GameEnding } {
  return { winner: loser === "white" ? "black" : "white", ending: "timeout" };
}

export function resignResult(who: Seat): { winner: GameWinner; ending: GameEnding } {
  return { winner: who === "white" ? "black" : "white", ending: "resignation" };
}
