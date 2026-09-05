"use client";

import { create } from "zustand";
import type { Concept } from "@/lib/chess/types";

/* Kept apart from the coach feed on purpose. A note is about a move that was
   played and belongs in the game's record; a hint is about the position in front
   of you right now and evaporates the moment you move. Mixing them would put
   advice you asked for into the transcript of what you actually did. */
type HintState = {
  /** The ply this explanation belongs to, so a stale stream can be ignored. */
  ply: number | null;
  stage: "idle" | "streaming" | "complete" | "error";
  prose: string;
  concepts: Concept[];
};

type HintActions = {
  begin: (ply: number) => void;
  patch: (next: Partial<HintState>) => void;
  append: (ply: number, delta: string) => void;
  clear: () => void;
};

const initial: HintState = { ply: null, stage: "idle", prose: "", concepts: [] };

export const useHint = create<HintState & HintActions>((set) => ({
  ...initial,
  begin: (ply) => set({ ...initial, ply, stage: "streaming" }),
  patch: (next) => set(next),
  append: (ply, delta) =>
    set((state) => (state.ply === ply ? { prose: state.prose + delta } : state)),
  clear: () => set(initial),
}));
