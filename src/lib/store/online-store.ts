"use client";

import { create } from "zustand";
import type { GameSnapshot, Seat } from "@/lib/multiplayer/protocol";

/* ── The online game, client side ─────────────────────────────────────────────
   Deliberately not persisted. The engine game keeps itself in `localStorage`
   because the browser is the only thing that knows about it; an online game lives
   on the server, so a reload should ask rather than remember. Anything cached here
   could be stale in a way the player could not see.

   `seq` is the cursor. Everything else follows from the last snapshot.
   ─────────────────────────────────────────────────────────────────────────── */

export type Connection = "connecting" | "live" | "reconnecting" | "closed";

type OnlineState = {
  gameId: string | null;
  /** Which seat you are, or null while watching or before joining. */
  seat: Seat | null;
  snapshot: GameSnapshot | null;
  connection: Connection;
  /** Offset between the server's clock and this browser's, in ms. Every clock
   *  reading is corrected by it, so a player whose system time is minutes off still
   *  sees the right numbers. */
  clockSkew: number;
  /** A move played locally but not yet acknowledged. Held so the board can show it
   *  immediately and roll back if the server disagrees. */
  pending: { from: string; to: string; promotion?: string; seq: number } | null;
  /** Last refusal from the server, for a one-line explanation to the player. */
  rejection: string | null;
};

type OnlineActions = {
  open: (gameId: string) => void;
  applySnapshot: (snapshot: GameSnapshot) => void;
  setConnection: (connection: Connection) => void;
  setPending: (pending: OnlineState["pending"]) => void;
  reject: (reason: string | null) => void;
  close: () => void;
};

const empty: OnlineState = {
  gameId: null,
  seat: null,
  snapshot: null,
  connection: "connecting",
  clockSkew: 0,
  pending: null,
  rejection: null,
};

export const useOnline = create<OnlineState & OnlineActions>()((set) => ({
  ...empty,
  open: (gameId) => set({ ...empty, gameId }),
  applySnapshot: (snapshot) =>
    set((state) => ({
      snapshot,
      seat: snapshot.seat,
      connection: "live",
      /* Measured on arrival rather than once at startup: a laptop that slept has a
         different offset when it wakes, and the clocks are the one thing a player
         will notice being wrong. */
      clockSkew: snapshot.serverNow - Date.now(),
      /* A snapshot that already contains the pending move confirms it; one that has
         moved past it without it means it was refused. Either way the optimistic
         copy has served its purpose. */
      pending:
        state.pending && snapshot.seq >= state.pending.seq ? null : state.pending,
    })),
  setConnection: (connection) => set({ connection }),
  setPending: (pending) => set({ pending }),
  reject: (rejection) => set({ rejection }),
  close: () => set({ ...empty }),
}));

/** Server time, as this browser can best estimate it. */
export function serverNow(): number {
  return Date.now() + useOnline.getState().clockSkew;
}
