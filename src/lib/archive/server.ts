import "server-only";
import type { PlayedGame } from "@/lib/db/schema";
import {
  EMPTY_TALLY,
  REVIEW_VERSION,
  type ArchivedReview,
  type GameSummary,
} from "./types";

/* The row/summary boundary, in one place. The client and the database want the same
   facts in slightly different shapes — nulls versus absent fields, an integer flag
   versus a boolean, a tally versus six columns — and putting both directions here means
   a change to either has exactly one place to be wrong. */

export type ArchiveBody = {
  summary?: GameSummary;
  review?: ArchivedReview | null;
};

/**
 * Whether a posted summary is one we will store.
 *
 * Everything a client sends about its own history is, in the end, its own business —
 * these are your statistics and lying to them only cheats you. So this checks shape
 * rather than plausibility: enough that a malformed body cannot violate a column or
 * poison an aggregate with a NaN, and no more. The owner is the one field never taken
 * from the body at all.
 */
export function validSummary(summary: GameSummary): boolean {
  const finite = (value: number | null | undefined) =>
    value === null || value === undefined || Number.isFinite(value);

  return (
    typeof summary.id === "string" &&
    summary.id.length > 0 &&
    summary.id.length <= 64 &&
    (summary.source === "engine" || summary.source === "online") &&
    (summary.side === "white" || summary.side === "black") &&
    typeof summary.opponent === "string" &&
    summary.opponent.length <= 120 &&
    ["win", "loss", "draw"].includes(summary.outcome) &&
    Number.isInteger(summary.moveCount) &&
    summary.moveCount >= 0 &&
    typeof summary.firstMoves === "string" &&
    summary.firstMoves.length <= 40 &&
    Number.isFinite(summary.playedAt) &&
    finite(summary.accuracy) &&
    finite(summary.opponentRating)
  );
}

export function summaryToRow(ownerId: string, summary: GameSummary) {
  const qualities = summary.qualities;
  return {
    ownerId,
    gameId: summary.id,
    source: summary.source,
    side: summary.side,
    opponent: summary.opponent.slice(0, 120),
    opponentRating: summary.opponentRating,
    outcome: summary.outcome,
    ending: summary.ending,
    moveCount: summary.moveCount,
    firstMoves: summary.firstMoves.slice(0, 40),
    initialMs: summary.initialMs,
    incrementMs: summary.incrementMs,
    rated: summary.rated ? 1 : 0,
    accuracy: summary.accuracy,
    /* Spread across columns rather than stored as the tally object, because these are
       what a statistics query sums — and summing inside a jsonb blob means reading
       every blob. `concepts` stays jsonb precisely because it has no fixed keys. */
    brilliants: qualities?.brilliant ?? null,
    bests: qualities?.best ?? null,
    inaccuracies: qualities?.inaccuracy ?? null,
    mistakes: qualities?.mistake ?? null,
    blunders: qualities?.blunder ?? null,
    hinted: summary.hinted,
    concepts: summary.concepts,
    playedAt: new Date(summary.playedAt),
  };
}

export function rowToSummary(row: PlayedGame): GameSummary {
  /* One column decides whether the game has been analysed at all. Reporting a tally of
     zeroes for an unanalysed game would put it in the averages as a flawless one. */
  const analysed = row.accuracy !== null;
  return {
    id: row.gameId,
    source: row.source,
    side: row.side,
    opponent: row.opponent,
    opponentRating: row.opponentRating,
    outcome: row.outcome,
    ending: row.ending,
    moveCount: row.moveCount,
    firstMoves: row.firstMoves,
    initialMs: row.initialMs,
    incrementMs: row.incrementMs,
    rated: row.rated === 1,
    playedAt: row.playedAt.getTime(),
    accuracy: row.accuracy,
    qualities: analysed
      ? {
          ...EMPTY_TALLY,
          brilliant: row.brilliants ?? 0,
          best: row.bests ?? 0,
          inaccuracy: row.inaccuracies ?? 0,
          mistake: row.mistakes ?? 0,
          blunder: row.blunders ?? 0,
        }
      : null,
    hinted: row.hinted,
    concepts: row.concepts ?? null,
  };
}

/** Whether a stored payload is the shape this build knows how to restore. */
export function readableReview(payload: unknown, version: number): ArchivedReview | null {
  if (version !== REVIEW_VERSION) return null;
  return payload as ArchivedReview;
}
