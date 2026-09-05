"use client";

import { evalAtPly, type AnalysisEntry } from "@/lib/store/engine-store";
import { evalToWinPct, sideAccuracy } from "@/lib/chess/eval";
import type { Annotation, MoveQuality, PlyRecord, Side } from "@/lib/chess/types";

export type GameStats = {
  accuracy: Record<Side, number | null>;
  /** Move-quality bands for the player, with hint-assisted praise removed. */
  qualities: MoveQuality[];
  /** Plies the player asked for a hint on before committing. */
  hintedCount: number;
  /** The single move that cost the most, or null if nothing was flagged. */
  worst: Annotation | null;
  /** Win% the worst move gave away. */
  worstLostPct: number;
};

/**
 * Everything the review page and the game-over dialog both need to say about a
 * finished game.
 *
 * This lives in one function on purpose. The dialog claims an accuracy figure
 * seconds before the review page claims one, and two implementations of the same
 * curve would eventually disagree by a point — which is exactly the kind of detail
 * that makes a number look made up.
 */
export function gameStats({
  plies,
  analysis,
  annotations,
  hintedPlies,
  playerSide,
}: {
  plies: PlyRecord[];
  analysis: (AnalysisEntry | null)[];
  annotations: Annotation[];
  hintedPlies: number[];
  playerSide: Side;
}): GameStats {
  /* Accuracy comes off the same win% curve the badges use, so a card saying
     "lost 21%" and the dial above it can never disagree. */
  const drops: Record<Side, number[]> = { white: [], black: [] };
  for (const record of plies) {
    const before = evalAtPly(analysis, record.ply - 1);
    const after = evalAtPly(analysis, record.ply);
    if (!before || !after) continue;
    const winBefore = evalToWinPct(before);
    const winAfter = evalToWinPct(after);
    const drop = record.side === "white" ? winBefore - winAfter : winAfter - winBefore;
    drops[record.side].push(Math.max(0, drop));
  }

  /* Praise you were handed is not praise. A hinted move can still be counted as an
     inaccuracy or a blunder — those you own — but it cannot be banked as your own
     best move, or the tally quietly congratulates you for reading an arrow. */
  const hinted = new Set(hintedPlies);
  const mine = annotations.filter((a) => a.side === playerSide);
  const qualities = mine
    .filter(
      (a) => !(hinted.has(a.ply) && (a.quality === "best" || a.quality === "brilliant")),
    )
    .map((a) => a.quality);

  const lost = (a: Annotation) => Math.abs(a.winPctBefore - a.winPctAfter);
  const worst = mine.reduce<Annotation | null>(
    (found, a) => (!found || lost(a) > lost(found) ? a : found),
    null,
  );

  return {
    accuracy: { white: sideAccuracy(drops.white), black: sideAccuracy(drops.black) },
    qualities,
    hintedCount: plies.filter((p) => hinted.has(p.ply)).length,
    worst,
    worstLostPct: worst ? lost(worst) : 0,
  };
}
