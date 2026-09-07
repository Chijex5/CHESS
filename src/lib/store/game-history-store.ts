"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LocalGameHistory = {
  id: string;
  outcome: "Won" | "Lost" | "Draw";
  opponent: string;
  playedAt: string;
  moves: number;
};

type HistoryState = { games: LocalGameHistory[]; add: (game: LocalGameHistory) => void };

export const useGameHistory = create<HistoryState>()(
  persist(
    (set) => ({
      games: [],
      add: (game) =>
        set((state) => ({
          games: state.games.some((entry) => entry.id === game.id)
            ? state.games
            : [game, ...state.games].slice(0, 50),
        })),
    }),
    { name: "coach-game-history", version: 1 },
  ),
);
