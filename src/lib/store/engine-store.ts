"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Evaluation } from "@/lib/chess/types";

/** The analyst's verdict on one position, always at the same nominal depth. */
export type AnalysisEntry = {
  evaluation: Evaluation;
  /** Best move in UCI coordinate notation, from this position. */
  bestMove: string | null;
  /** Principal variation, UCI. */
  pv: string[];
  depth: number;
};

type EngineState = {
  /** Index n = the position *after* ply n. Index 0 is the start position. */
  analysis: (AnalysisEntry | null)[];
  liveEval: Evaluation | null;
  liveDepth: number;
  settled: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
};

type EngineActions = {
  patch: (next: Partial<EngineState>) => void;
  setAnalysis: (ply: number, entry: AnalysisEntry) => void;
  reset: () => void;
};

/** Depth at which the bar may commit to a number. Below this the search is
 *  still thrashing, and showing it reads as a broken widget. */
export const COMMIT_DEPTH = 10;

export const useEngine = create<EngineState & EngineActions>()(
  persist(
    (set) => ({
      analysis: [],
      liveEval: null,
      liveDepth: 0,
      settled: true,
      ready: false,
      loading: false,
      error: null,
      patch: (next) => set(next),
      setAnalysis: (ply, entry) =>
        set((state) => {
          const analysis = [...state.analysis];
          while (analysis.length <= ply) analysis.push(null);
          analysis[ply] = entry;
          return { analysis };
        }),
      reset: () =>
        set({ analysis: [], liveEval: null, liveDepth: 0, settled: true, error: null }),
    }),
    {
      name: "coach-analysis",
      version: 1,
      /* The searches, and nothing else. `ready`/`loading` describe a worker that
         does not exist yet on a fresh page, and restoring them would leave the
         board behind a "Loading Stockfish" veil that never lifts. Keeping the
         evaluations is what lets the review page and its graph survive a refresh. */
      partialize: (state) => ({ analysis: state.analysis }),
    },
  ),
);

export function evalAtPly(
  analysis: (AnalysisEntry | null)[],
  ply: number,
): Evaluation | null {
  return analysis[Math.max(0, ply)]?.evaluation ?? null;
}
