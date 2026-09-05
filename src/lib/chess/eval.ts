import type { Evaluation, MoveQuality, Side } from "./types";

/** Lichess' centipawn → winning-chances curve.
 *  Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 *  Used for bar geometry because a linear cp bar pegs at ±10 pawns and
 *  then stops moving, exactly where resolution matters least. */
export function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function evalToWinPct(e: Evaluation): number {
  if (e.kind === "mated") return e.winner === "white" ? 100 : 0;
  if (e.kind === "mate") return e.movesToMate > 0 ? 100 : 0;
  return cpToWinPct(e.cp);
}

/** Lichess' per-move accuracy curve.
 *  Accuracy% = 103.1668 * exp(-0.04354 * winPctDrop) - 3.1669 */
export function accuracyFromDrop(winPctDrop: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, winPctDrop)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

/** Display form: "+1.4", "-0.35", "M5", "-M3", "1-0". */
export function formatEval(e: Evaluation): string {
  // A finished game gets the result, not a distance to a mate already delivered.
  if (e.kind === "mated") return e.winner === "white" ? "1-0" : "0-1";
  if (e.kind === "mate") {
    const n = Math.abs(e.movesToMate);
    return `${e.movesToMate < 0 ? "-" : ""}M${n}`;
  }
  const pawns = e.cp / 100;
  const sign = pawns > 0 ? "+" : pawns < 0 ? "−" : "";
  return `${sign}${Math.abs(pawns).toFixed(Math.abs(pawns) < 10 ? 2 : 1)}`;
}

/* ── The eval in words ────────────────────────────────────────────────────────
   `+0.26` is a number about a position; "you are slightly better" is a fact about
   your game. A player who does not already think in centipawns gets nothing from
   the former, and the whole premise of this app is that they are the audience.

   Bands are on win%, not pawns, for the same reason the bar's geometry is: the
   difference between +0.2 and +0.6 matters and the difference between +7 and +9
   does not. Phrased from the reader's side, because "White is better" requires you
   to remember which one you are.
   ─────────────────────────────────────────────────────────────────────────── */
const STANDINGS: { above: number; you: string; them: string }[] = [
  { above: 95, you: "Winning", them: "Lost" },
  { above: 80, you: "Much better for you", them: "Much better for them" },
  { above: 62, you: "Better for you", them: "Better for them" },
  { above: 55, you: "Slightly better for you", them: "Slightly better for them" },
];

export function describeEval(e: Evaluation, playerSide: Side): string {
  if (e.kind === "mated") {
    return e.winner === playerSide ? "Checkmate — you won" : "Checkmate — you lost";
  }
  if (e.kind === "mate") {
    const yours = (e.movesToMate > 0) === (playerSide === "white");
    const moves = Math.abs(e.movesToMate);
    return yours
      ? `You have mate in ${moves}`
      : `They have mate in ${moves}`;
  }

  const winPct = evalToWinPct(e);
  const mine = playerSide === "white" ? winPct : 100 - winPct;
  const band = STANDINGS.find((s) => mine >= s.above);
  if (band) return band.you;
  const mirrored = STANDINGS.find((s) => 100 - mine >= s.above);
  return mirrored ? mirrored.them : "Level";
}

/** Win% drop → quality band. Thresholds are on winning chances, not raw
 *  centipawns: losing 200cp at +8 barely matters, losing 80cp at 0.0 does. */
export function classify(drop: number, isBest: boolean): MoveQuality {
  if (isBest) return "best";
  if (drop >= 30) return "blunder";
  if (drop >= 20) return "mistake";
  if (drop >= 10) return "inaccuracy";
  return "good";
}

/** Per-side accuracy from the win% each move gave away.
 *  Lichess blends a volatility-weighted mean with a harmonic mean over sliding
 *  windows; this is the plain mean of per-move accuracy, so it will read a
 *  little differently from the number Lichess shows for the same game. */
export function sideAccuracy(drops: number[]): number | null {
  if (drops.length === 0) return null;
  const total = drops.reduce((sum, drop) => sum + accuracyFromDrop(drop), 0);
  return Number((total / drops.length).toFixed(1));
}
