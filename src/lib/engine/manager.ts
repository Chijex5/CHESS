import { UciEngine } from "./uci";

/** Fixed depth for every analysis search. Deltas are only comparable if both
 *  sides of the subtraction came from the same nominal depth. */
export const ANALYSIS_DEPTH = 14;

let opponent: UciEngine | null = null;
let analyst: UciEngine | null = null;

/* Two instances, not one. The opponent is deliberately weakened via
   UCI_LimitStrength; reusing it for analysis would mean every eval the coach
   cites came from a crippled search. */

export function getOpponent(elo: number): UciEngine {
  if (!opponent) {
    opponent = new UciEngine({
      Threads: 1,
      Hash: 16,
      UCI_LimitStrength: true,
      UCI_Elo: clampElo(elo),
    });
  }
  return opponent;
}

export function getAnalyst(): UciEngine {
  if (!analyst) {
    analyst = new UciEngine({ Threads: 1, Hash: 32, UCI_LimitStrength: false });
  }
  return analyst;
}

/** Stockfish's own range (Search::Skill::LowestElo/HighestElo). */
export const ELO_MIN = 1320;
export const ELO_MAX = 3190;

export function clampElo(elo: number) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(elo)));
}

export async function setOpponentElo(elo: number) {
  if (!opponent) return;
  await opponent.setOption("UCI_Elo", clampElo(elo));
}

export function disposeEngines() {
  opponent?.terminate();
  analyst?.terminate();
  opponent = null;
  analyst = null;
}
