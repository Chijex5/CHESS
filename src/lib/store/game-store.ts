"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GameResult,
  GameStatus,
  PieceColor,
  PlyRecord,
  Square,
} from "@/lib/chess/types";
import { START_FEN } from "@/lib/chess/fen";

/** How much of the engine's recommendation the player has asked to see for the
 *  position in front of them. Deliberately staged: naming the piece leaves the
 *  move to be found, which is the part worth practising. */
export type HintStage = 0 | 1 | 2;

type GameState = {
  plies: PlyRecord[];
  /** Position on screen. Equals plies.length when following the live game. */
  viewPly: number;
  playerColor: PieceColor;
  flipped: boolean;
  status: GameStatus;
  result: GameResult | null;
  /** Legal destinations from each square, for the live position only. */
  legal: Record<string, Square[]>;
  selected: Square | null;
  checkSquare: Square | null;
  pendingPromotion: { from: Square; to: Square } | null;
  lastAnnouncement: string;
  hintStage: HintStage;
  /** Plies played after asking for a hint. Kept so the review can be honest about
   *  which moves were the player's own idea. */
  hintedPlies: number[];
  /** A move the player has been warned about but not yet committed to. */
  pendingRisk: { from: Square; to: Square; promotion?: string; reason: string } | null;
};

type GameActions = {
  reset: (playerColor: PieceColor) => void;
  patch: (next: Partial<GameState>) => void;
  appendPly: (record: PlyRecord) => void;
  /** Drops the last `count` plies — used by retry-move. */
  truncate: (count: number) => void;
  select: (square: Square | null) => void;
  setViewPly: (ply: number) => void;
  flip: () => void;
  revealHint: () => void;
  markHinted: (ply: number) => void;
};

const initial: GameState = {
  plies: [],
  viewPly: 0,
  playerColor: "w",
  flipped: false,
  status: "idle",
  result: null,
  legal: {},
  selected: null,
  checkSquare: null,
  pendingPromotion: null,
  lastAnnouncement: "",
  hintStage: 0,
  hintedPlies: [],
  pendingRisk: null,
};

export const useGame = create<GameState & GameActions>()(
  persist(
    (set) => ({
      ...initial,
      reset: (playerColor) =>
        set({ ...initial, playerColor, flipped: playerColor === "b", status: "playing" }),
      patch: (next) => set(next),
      appendPly: (record) =>
        set((state) => ({
          plies: [...state.plies, record],
          viewPly: state.plies.length + 1,
          selected: null,
          // A hint belongs to one position; the next one starts from nothing.
          hintStage: 0,
          pendingRisk: null,
        })),
      truncate: (count) =>
        set((state) => {
          const plies = state.plies.slice(0, Math.max(0, state.plies.length - count));
          return {
            plies,
            viewPly: plies.length,
            selected: null,
            result: null,
            status: "playing",
            hintStage: 0,
            hintedPlies: state.hintedPlies.filter((p) => p <= plies.length),
          };
        }),
      select: (square) => set({ selected: square }),
      setViewPly: (ply) => set({ viewPly: ply, selected: null, hintStage: 0 }),
      flip: () => set((state) => ({ flipped: !state.flipped })),
      revealHint: () =>
        set((state) => ({ hintStage: Math.min(2, state.hintStage + 1) as HintStage })),
      markHinted: (ply) =>
        set((state) =>
          state.hintedPlies.includes(ply)
            ? state
            : { hintedPlies: [...state.hintedPlies, ply] },
        ),
    }),
    {
      name: "coach-game",
      version: 1,
      /* Only the record of what happened. `legal`, `checkSquare` and friends are
         derived from the chess.js board the controller owns, and a stale copy of
         them would let you click squares the real position does not allow — so they
         are recomputed on resume instead of restored. */
      partialize: (state) => ({
        plies: state.plies,
        viewPly: state.viewPly,
        playerColor: state.playerColor,
        flipped: state.flipped,
        status: state.status,
        result: state.result,
        hintedPlies: state.hintedPlies,
      }),
    },
  ),
);

export function fenAtPly(plies: PlyRecord[], ply: number): string {
  if (ply <= 0) return START_FEN;
  return plies[Math.min(ply, plies.length) - 1].fenAfter;
}

export function lastMoveAtPly(plies: PlyRecord[], ply: number) {
  if (ply <= 0) return null;
  const record = plies[Math.min(ply, plies.length) - 1];
  return { from: record.from, to: record.to };
}
