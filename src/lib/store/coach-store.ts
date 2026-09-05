"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Annotation } from "@/lib/chess/types";

type CoachState = {
  /** Keyed by ply so out-of-order stream completion is a non-issue. */
  byPly: Record<number, Annotation>;
};

type CoachActions = {
  upsert: (ply: number, patch: Partial<Annotation> & Pick<Annotation, "ply">) => void;
  appendProse: (ply: number, delta: string) => void;
  clear: () => void;
};

export const useCoach = create<CoachState & CoachActions>()(
  persist(
    (set) => ({
      byPly: {},
      upsert: (ply, patch) =>
        set((state) => ({
          byPly: {
            ...state.byPly,
            [ply]: { ...(state.byPly[ply] as Annotation | undefined), ...patch } as Annotation,
          },
        })),
      appendProse: (ply, delta) =>
        set((state) => {
          const current = state.byPly[ply];
          if (!current) return state;
          return {
            byPly: { ...state.byPly, [ply]: { ...current, prose: current.prose + delta } },
          };
        }),
      clear: () => set({ byPly: {} }),
    }),
    {
      name: "coach-notes",
      version: 1,
      partialize: (state) => ({ byPly: state.byPly }),
      /* A tab closed mid-stream leaves a note stuck on "streaming", which would
         rehydrate as a spinner that never resolves. Settle every note on load: it
         either has prose and is done, or it never arrived and says so. */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const byPly = { ...state.byPly };
        for (const [key, note] of Object.entries(byPly)) {
          if (note.stage === "complete" || note.stage === "error") continue;
          byPly[Number(key)] = { ...note, stage: note.prose ? "complete" : "error" };
        }
        state.byPly = byPly;
      },
    },
  ),
);

export function sortedAnnotations(byPly: Record<number, Annotation>): Annotation[] {
  return Object.values(byPly).sort((a, b) => a.ply - b.ply);
}
