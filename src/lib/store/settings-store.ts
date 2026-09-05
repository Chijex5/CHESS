"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { configureAudio } from "@/lib/audio/sfx";

export type Sensitivity = "blunders" | "mistakes" | "inaccuracies" | "every";
export type Verbosity = "terse" | "standard" | "deep";
/** Who the coach is talking to. Drives vocabulary, explanation length, and
 *  whether the app warns before you leave a piece hanging. */
export type Level = "new" | "improving" | "club";
export type Timing = "immediate" | "after-reply" | "post-game";
export type EvalVisibility = "always" | "after-coach" | "game-end";
export type BoardTheme = "walnut" | "tournament" | "slate";
export type PlaySide = "white" | "black" | "random";

export type Settings = {
  level: Level;
  elo: number;
  thinkMs: number;
  side: PlaySide;
  sensitivity: Sensitivity;
  verbosity: Verbosity;
  timing: Timing;
  evalVisibility: EvalVisibility;
  boardTheme: BoardTheme;
  praiseGoodMoves: boolean;
  soundEnabled: boolean;
  /** 0–1, applied to the master gain. */
  volume: number;
};

export const DEFAULT_SETTINGS: Settings = {
  level: "improving",
  elo: 1600,
  thinkMs: 700,
  side: "white",
  sensitivity: "inaccuracies",
  verbosity: "standard",
  timing: "after-reply",
  evalVisibility: "after-coach",
  boardTheme: "walnut",
  praiseGoodMoves: false,
  soundEnabled: true,
  volume: 0.6,
};

/* One dial the player understands, rather than two that both mean "how much
   explanation". Picking a level sets the length; `verbosity` is still there for
   anyone who opens Advanced and wants to override it. */
export const LEVEL_VERBOSITY: Record<Level, Verbosity> = {
  new: "standard",
  improving: "standard",
  club: "terse",
};

/** Hanging-piece warnings are for players still learning to see the board. */
export function warnsOnHangingPiece(level: Level) {
  return level !== "club";
}

/** Win% drop at which a move earns an explanation. */
export const SENSITIVITY_THRESHOLD: Record<Sensitivity, number> = {
  blunders: 30,
  mistakes: 20,
  inaccuracies: 10,
  every: 0,
};

type SettingsStore = Settings & {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
};

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "coach-settings",
      version: 1,
      /* The audio module holds mute/volume as plain values rather than reading
         the store, so it never participates in a render. Push them across on
         rehydrate and on every change instead. */
      onRehydrateStorage: () => (state) => {
        if (state) configureAudio({ enabled: state.soundEnabled, volume: state.volume });
      },
    },
  ),
);

useSettings.subscribe((state) =>
  configureAudio({ enabled: state.soundEnabled, volume: state.volume }),
);
