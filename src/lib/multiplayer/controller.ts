"use client";

import { Chess } from "chess.js";
import { useOnline, serverNow } from "@/lib/store/online-store";
import { playCue, cueForMove } from "@/lib/audio/sfx";
import { liveRemaining } from "./rules";
import { sendMove } from "./client";
import type { GameSnapshot, Seat } from "./protocol";
import type { Square } from "@/lib/chess/types";

/* ── The online game's own controller ─────────────────────────────────────────
   Separate from `game/controller.ts` on purpose. That file is 700 lines of engine
   game — booting Stockfish, weakening it, queueing analysis, scheduling the coach,
   staging hints — and none of it applies here. Threading `if (online)` through the
   one file that must stay correct would have produced a thicket; this shares what
   is genuinely shared instead: the board component, chess.js, the notation helpers
   and the drill and stats code that runs after the game.

   The asymmetry with single player: there, the browser decides. Here it *proposes*.
   A move is drawn immediately because waiting a round trip for your own move feels
   broken, and the next snapshot either confirms it or replaces it.
   ─────────────────────────────────────────────────────────────────────────── */

/** The position a snapshot describes, plus the optimistic move if one is in flight. */
export function boardFor(snapshot: GameSnapshot | null, pending: PendingMove | null): Chess {
  const board = new Chess();
  if (!snapshot) return board;
  for (const san of snapshot.sans) {
    try {
      board.move(san);
    } catch {
      // The server wrote this log; an unreplayable move means a bug, and a partial
      // board is still better than a blank one.
      break;
    }
  }
  if (pending) {
    try {
      board.move({ from: pending.from, to: pending.to, promotion: pending.promotion });
    } catch {
      // Refused locally, which the server would also have refused.
    }
  }
  return board;
}

type PendingMove = { from: string; to: string; promotion?: string; seq: number };

/** Whose turn it is, from the move count rather than from anything we were told. */
export function turnOf(snapshot: GameSnapshot | null, pending: PendingMove | null): Seat {
  const plies = (snapshot?.sans.length ?? 0) + (pending ? 1 : 0);
  return plies % 2 === 0 ? "white" : "black";
}

export function isMyTurn(snapshot: GameSnapshot | null, pending: PendingMove | null): boolean {
  if (!snapshot || snapshot.status !== "active" || !snapshot.seat) return false;
  return turnOf(snapshot, pending) === snapshot.seat;
}

/** Legal destinations from every square that has one, for the seat on the move. */
export function legalFor(board: Chess, seat: Seat | null): Record<string, Square[]> {
  const map: Record<string, Square[]> = {};
  if (!seat || (board.turn() === "w" ? "white" : "black") !== seat) return map;
  for (const move of board.moves({ verbose: true })) {
    (map[move.from] ??= []).push(move.to);
  }
  return map;
}

/**
 * Plays a move: draws it, sends it, and lets the stream have the last word.
 *
 * The optimistic copy is not rolled back on rejection. The server's refusal is
 * always followed by a snapshot, and having both the error path and the stream
 * correcting the same state is how two sources of truth are created.
 */
export async function playOnline(
  from: Square,
  to: Square,
  promotion?: string,
): Promise<void> {
  const state = useOnline.getState();
  const { snapshot, gameId } = state;
  if (!snapshot || !gameId || !isMyTurn(snapshot, state.pending)) return;

  const seq = snapshot.sans.length + 1;
  const board = boardFor(snapshot, null);
  let move;
  try {
    move = board.move({ from, to, promotion });
  } catch {
    playCue("illegal");
    return;
  }

  state.setPending({ from, to, promotion, seq });
  state.reject(null);
  playCue(cueForMove(move));

  const result = await sendMove(gameId, { from, to, promotion, seq });
  if (!result.ok) {
    playCue("illegal");
    useOnline.getState().reject(explain(result.reason));
    useOnline.getState().setPending(null);
  }
}

/** What a refusal means, in words a player can act on. */
function explain(reason: string): string {
  switch (reason) {
    case "not-your-turn":
      return "It is not your move.";
    case "out-of-sequence":
      return "Your opponent moved first — the board has caught up.";
    case "illegal-move":
      return "That move is not legal in this position.";
    case "flagged":
      return "Your time ran out.";
    case "game-not-active":
      return "This game is over.";
    case "not-a-player":
      return "You are watching this game, not playing it.";
    case "sign-in-required":
      return "Sign in to play.";
    default:
      return "The server refused that move.";
  }
}

/** Live clocks, corrected for this browser's clock being wrong. */
export function clocksNow(snapshot: GameSnapshot | null): Record<Seat, number> {
  if (!snapshot) return { white: 0, black: 0 };
  if (snapshot.status !== "active") {
    return { white: snapshot.msLeftWhite, black: snapshot.msLeftBlack };
  }
  /* The same `liveRemaining` the server uses to adjudicate a flag, so the number on
     screen and the number that decides the game cannot drift apart. The snapshot's
     figures are banked as of the last move; the projection happens here, against
     server time rather than this browser's. */
  return liveRemaining({
    clock: { initialMs: snapshot.initialMs, incrementMs: snapshot.incrementMs },
    banked: { white: snapshot.msLeftWhite, black: snapshot.msLeftBlack },
    turn: turnOf(snapshot, null),
    turnStartedAt: snapshot.turnStartedAt,
    now: serverNow(),
  });
}
