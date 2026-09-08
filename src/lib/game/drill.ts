"use client";

import { Chess } from "chess.js";
import { ANALYSIS_DEPTH, getAnalyst } from "@/lib/engine/manager";
import { evalToWinPct } from "@/lib/chess/eval";
import type { Annotation, Evaluation, Square } from "@/lib/chess/types";

/** One position to solve: the board as it stood before a move you got wrong. */
export type Drill = {
  /** Which game this came from. Empty for the game currently loaded in the stores,
   *  which is the only one that needs no identifying. */
  gameId: string;
  /** Stable across games, unlike `ply` — two games both have a fourteenth move. */
  key: string;
  ply: number;
  moveNumber: number;
  fen: string;
  /** The move the engine wanted, in SAN — the annotation already carries it. */
  bestSan: string;
  /** What you played the first time, so the drill can name your own mistake. */
  playedSan: string;
  /** The engine's verdict on this position, already searched during the game. */
  evalBefore: Evaluation;
  quality: Annotation["quality"];
  lostPct: number;
};

/* Worst first. A session you abandon after two positions should have spent them on
   the two moves that actually cost you the game. */
export function drillsFrom(annotations: Annotation[], gameId = ""): Drill[] {
  return annotations
    .filter((a) => a.quality !== "best" && a.quality !== "brilliant")
    .map((a) => ({
      gameId,
      key: `${gameId}:${a.ply}`,
      ply: a.ply,
      moveNumber: a.moveNumber,
      fen: a.fenBefore,
      bestSan: a.bestSan,
      playedSan: a.playedSan,
      evalBefore: a.evalBefore,
      quality: a.quality,
      lostPct: Math.abs(a.winPctBefore - a.winPctAfter),
    }))
    .sort((a, b) => b.lostPct - a.lostPct);
}

export type Verdict =
  | { kind: "best"; san: string }
  | { kind: "good"; san: string; lostPct: number }
  | { kind: "worse"; san: string; lostPct: number }
  | { kind: "illegal" };

/** Win% a move may give up and still count as solved. */
const TOLERANCE = 5;

/**
 * Judges an attempt at a drill.
 *
 * Matching the engine's move exactly is accepted without a search. Anything else
 * gets searched, because demanding the single best move teaches the wrong lesson:
 * plenty of moves are fine, and a drill that rejects them trains you to guess what
 * Stockfish wants rather than to stop losing material.
 *
 * Exactly one search, not two. The evaluation of the position *before* the attempt
 * was already computed during the game and travels on the annotation, so re-deriving
 * it would double a wait the player is sitting through — and two searches can also
 * disagree slightly, which would make the tolerance below drift.
 */
export async function judgeAttempt(
  drill: Drill,
  from: Square,
  to: Square,
  promotion?: string,
): Promise<Verdict> {
  const board = new Chess(drill.fen);
  let move;
  try {
    move = board.move({ from, to, promotion });
  } catch {
    return { kind: "illegal" };
  }
  if (move.san === drill.bestSan) return { kind: "best", san: move.san };

  const analyst = getAnalyst();
  await analyst.init();
  const after = await analyst.search({ fen: board.fen(), depth: ANALYSIS_DEPTH });

  /* Both evaluations are normalised to White, so they only become a "how much did
     this cost *me*" once flipped into the mover's point of view. */
  const moverIsWhite = move.color === "w";
  const winBefore = evalToWinPct(drill.evalBefore);
  const winAfter = evalToWinPct(after.evaluation);
  const lostPct =
    (moverIsWhite ? winBefore : 100 - winBefore) -
    (moverIsWhite ? winAfter : 100 - winAfter);

  const rounded = Math.max(0, Number(lostPct.toFixed(1)));
  return rounded <= TOLERANCE
    ? { kind: "good", san: move.san, lostPct: rounded }
    : { kind: "worse", san: move.san, lostPct: rounded };
}

/**
 * Drills from several games at once — the point of keeping them.
 *
 * Still worst first, and still worst *overall* rather than round-robin across games: a
 * session that ends after three positions should have spent them on the three worst
 * moves you have played, wherever they happened. Deduplicated by position, because
 * playing the same losing move in two games is one thing to learn, not two.
 */
export function drillsFromMany(
  sources: { gameId: string; annotations: Annotation[] }[],
): Drill[] {
  const seen = new Set<string>();
  const all: Drill[] = [];
  for (const source of sources) {
    for (const drill of drillsFrom(source.annotations, source.gameId)) {
      // The FEN *and* the move: the same position reached twice and answered differently
      // is two different mistakes.
      const fingerprint = `${drill.fen}|${drill.playedSan}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      all.push(drill);
    }
  }
  return all.sort((a, b) => b.lostPct - a.lostPct);
}
