import type {
  Annotation,
  GameResult,
  MoveQuality,
  PieceColor,
  PlyRecord,
  Side,
} from "@/lib/chess/types";
import type { GameEnding } from "@/lib/multiplayer/protocol";
import type { AnalysisEntry } from "@/lib/store/engine-store";

/* ── What a finished game is, once it is over ──────────────────────────────────
   Until now a finished game was whatever happened to still be in three
   localStorage stores, which meant exactly one of them existed at a time. These are
   the two shapes it gets instead, and they are split by how they are read rather
   than by what they mean.

   A summary is small and read in bulk: the statistics page scans every one you own.
   A review is tens of kilobytes and read one at a time, when you open it. Keeping
   them apart is the difference between a stats query reading a few kilobytes and
   reading megabytes, and it is why the archive has two methods rather than one.
   ─────────────────────────────────────────────────────────────────────────── */

export type GameOutcome = "win" | "loss" | "draw";
export type GameSource = "engine" | "online";

/** Counts of each move-quality band among *your* moves, hint-assisted praise already
 *  removed — the same tally `gameStats` produces for the game-over dialog. */
export type QualityTally = Record<MoveQuality, number>;

export type GameSummary = {
  /** The server's id for an online game; a client-generated one for an engine game,
   *  which no server ever saw. */
  id: string;
  source: GameSource;
  /** Which side you had. Not "playerColor": the rest of the archive speaks in
   *  `Side`, and one vocabulary per boundary is worth the conversion. */
  side: Side;
  /** Who you played, as it should be printed — a username, or "Karpov · 1600". Stored
   *  rather than looked up so a history row still reads correctly after they rename
   *  themselves. */
  opponent: string;
  opponentRating: number | null;
  outcome: GameOutcome;
  ending: GameEnding | null;
  moveCount: number;
  /** The first three plies in SAN, space-separated. Enough to say what you open with
   *  and how it tends to go, without carrying an opening book. */
  firstMoves: string;
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  /** Epoch ms. */
  playedAt: number;

  /* Everything below arrives later than the rest of the row, and null means "not
     analysed yet" rather than "missing". An online game's result is written by the
     server the instant it ends, at which point nothing has been searched — the client
     analyses the move list afterwards and fills these in. */
  accuracy: number | null;
  qualities: QualityTally | null;
  hinted: number | null;
  /** Concept slug → how many of your own mistakes the coach cited it against. */
  concepts: Record<string, number> | null;
};

/** The current `ArchivedReview` shape. Bump when a field changes meaning: a stored
 *  review from an older version is re-analysed rather than restored wrongly. */
export const REVIEW_VERSION = 1;

/** The three client stores' working set, as one serialisable object.
 *
 *  Deliberately the stores' own shapes rather than a translation of them. Restoring a
 *  review means putting these straight back where they came from, and any mapping in
 *  between would be a second definition of what a review is — one that could drift
 *  from the one the review page actually reads. */
export type ArchivedReview = {
  version: number;
  plies: PlyRecord[];
  /** Index n = the position after ply n; index 0 is the start. Sparse by nature. */
  analysis: (AnalysisEntry | null)[];
  annotations: Annotation[];
  hintedPlies: number[];
  playerColor: PieceColor;
  result: GameResult;
};

/**
 * One archive, two backends.
 *
 * Postgres when signed in, IndexedDB when not — and never both, so there is never a
 * question about which one is right. A signed-out player keeps their history on the
 * device they played on, which is the same deal single player has always had; a
 * signed-in one gets it on every device, which is the reason to have an account.
 */
export type Archive = {
  /** Upsert. Called when a game ends and again when the coach's notes finish
   *  arriving, so it must be safe to call twice with more information the second
   *  time. Passing `review: null` leaves any stored review alone. */
  put(summary: GameSummary, review: ArchivedReview | null): Promise<void>;
  /** Newest first. */
  summaries(limit?: number): Promise<GameSummary[]>;
  review(id: string): Promise<ArchivedReview | null>;
  remove(id: string): Promise<void>;
};

/** Whether a stored review can be handed back to the stores as-is. */
export function isRestorable(review: ArchivedReview | null): review is ArchivedReview {
  return review !== null && review.version === REVIEW_VERSION;
}

export const EMPTY_TALLY: QualityTally = {
  brilliant: 0,
  best: 0,
  good: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
};

/** Counts a list of quality bands into a tally. */
export function tally(qualities: MoveQuality[]): QualityTally {
  const counts = { ...EMPTY_TALLY };
  for (const quality of qualities) counts[quality] += 1;
  return counts;
}
