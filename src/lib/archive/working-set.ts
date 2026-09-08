"use client";

import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";
import { useEngine } from "@/lib/store/engine-store";
import { useGame } from "@/lib/store/game-store";
import { gameStats } from "@/lib/game/stats";
import { archive } from "./index";
import { REVIEW_VERSION, tally, type ArchivedReview, type GameSummary } from "./types";
import type { Annotation, PieceColor, Side } from "@/lib/chess/types";

/* ── Between the stores and the archive ───────────────────────────────────────
   The three stores are the working set: one game, loaded, with everything the review
   page reads. That is worth keeping — it is why the review page needs no branch for
   where a game came from — so the archive does not replace them. It saves one and
   puts one back.

   Which makes this module the whole of the "many games" feature. Everything else
   already worked; it just had nowhere to put the last one.
   ─────────────────────────────────────────────────────────────────────────── */

const sideOf = (colour: PieceColor): Side => (colour === "w" ? "white" : "black");

/** Reads the three stores into one serialisable object. */
export function captureReview(): ArchivedReview | null {
  const game = useGame.getState();
  if (game.plies.length === 0 || !game.result) return null;
  return {
    version: REVIEW_VERSION,
    plies: game.plies,
    analysis: useEngine.getState().analysis,
    annotations: sortedAnnotations(useCoach.getState().byPly),
    hintedPlies: game.hintedPlies,
    playerColor: game.playerColor,
    result: game.result,
  };
}

/**
 * Puts a stored review back where it came from.
 *
 * The persisted copies are cleared first for the same reason `analyseFinishedGame`
 * clears them: a rehydration from another game landing a moment later would overwrite
 * the one being restored, and the symptom — a review showing the wrong game's notes —
 * is one nobody would connect to a race.
 */
export function restoreReview(gameId: string, review: ArchivedReview): void {
  useCoach.persist.clearStorage();
  useEngine.persist.clearStorage();
  useGame.persist.clearStorage();

  useCoach.getState().clear();
  useEngine.getState().reset();
  useGame.getState().reset(review.playerColor);

  for (const annotation of review.annotations) {
    useCoach.getState().upsert(annotation.ply, annotation);
  }
  review.analysis.forEach((entry, ply) => {
    if (entry) useEngine.getState().setAnalysis(ply, entry);
  });
  useGame.getState().patch({
    plies: review.plies,
    viewPly: review.plies.length,
    hintedPlies: review.hintedPlies,
    status: "over",
    result: review.result,
    reviewGameId: gameId,
  });
}

/** Concept slug → how often the coach cited it against one of your own mistakes.
 *
 *  Only your own, and only the moves that cost something: a concept named while
 *  praising your best move is not a weakness, and counting it as one would rank the
 *  ideas you already have alongside the ones you do not. */
export function weaknessesFrom(annotations: Annotation[], side: Side): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const annotation of annotations) {
    if (annotation.side !== side) continue;
    if (annotation.quality === "best" || annotation.quality === "brilliant") continue;
    for (const concept of annotation.concepts) {
      counts[concept.slug] = (counts[concept.slug] ?? 0) + 1;
    }
  }
  return counts;
}

/** The first three plies, which is enough to name an opening without a book. */
export function openingOf(sans: string[]): string {
  return sans.slice(0, 3).join(" ");
}

/** Everything about a finished game that the stores do not know: who you played, on
 *  what clock, and whether it counted. */
export type GameFacts = {
  id: string;
  source: GameSummary["source"];
  opponent: string;
  opponentRating: number | null;
  ending: GameSummary["ending"];
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  playedAt?: number;
};

/**
 * Saves the game currently in the stores.
 *
 * Called twice per game and designed for it: once when the result lands, when there is
 * no analysis yet, and again when the coach's notes have finished arriving. The second
 * call carries the accuracy and the weaknesses, and both are upserts — so a player who
 * closes the tab in between still has the game in their history, marked unanalysed,
 * which is exactly what it is.
 */
export async function saveFinishedGame(facts: GameFacts): Promise<void> {
  const game = useGame.getState();
  if (!game.result) return;

  const annotations = sortedAnnotations(useCoach.getState().byPly);
  const side = sideOf(game.playerColor);
  const analysed = annotations.length > 0;

  const stats = analysed
    ? gameStats({
        plies: game.plies,
        analysis: useEngine.getState().analysis,
        annotations,
        hintedPlies: game.hintedPlies,
        playerSide: side,
      })
    : null;

  const summary: GameSummary = {
    id: facts.id,
    source: facts.source,
    side,
    opponent: facts.opponent,
    opponentRating: facts.opponentRating,
    outcome:
      game.result.playerWon === null ? "draw" : game.result.playerWon ? "win" : "loss",
    ending: facts.ending,
    moveCount: game.plies.length,
    firstMoves: openingOf(game.plies.map((ply) => ply.san)),
    initialMs: facts.initialMs,
    incrementMs: facts.incrementMs,
    rated: facts.rated,
    playedAt: facts.playedAt ?? Date.now(),
    /* `accuracy[side]` can be null on a game short enough that nothing was measured.
       Left null rather than defaulted, so an average is over games that have one. */
    accuracy: stats?.accuracy[side] ?? null,
    qualities: stats ? tally(stats.qualities) : null,
    hinted: stats?.hintedCount ?? null,
    concepts: analysed ? weaknessesFrom(annotations, side) : null,
  };

  const store = await archive();
  await store.put(summary, analysed ? captureReview() : null);
}
