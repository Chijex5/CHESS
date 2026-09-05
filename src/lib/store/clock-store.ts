"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Side } from "@/lib/chess/types";

/* ── The clock ────────────────────────────────────────────────────────────────
   Time is banked, not ticked. The store holds each side's remaining time as of
   the last switch plus the instant the running side started; the live figure is
   arithmetic done at read time.

   That matters because a clock stored as a ticking number is a store write ten
   times a second, and every subscriber — the board, the coach panel, the notation
   — re-renders with it. Here only `<Clock/>` re-renders, on its own interval, and
   the store changes once per move.
   ─────────────────────────────────────────────────────────────────────────── */
type ClockState = {
  /** False when the time control is "No clock" — nothing renders, nothing ticks. */
  enabled: boolean;
  incrementMs: number;
  /** Banked as of the last switch. */
  remaining: Record<Side, number>;
  /** Side whose clock is running, or null when stopped. */
  running: Side | null;
  /** `Date.now()` when the running side's turn began. Never persisted. */
  since: number | null;
  /** Side that ran out, so the flag is claimed exactly once. */
  flagged: Side | null;
};

type ClockActions = {
  /** Fresh clock for a new game. `initialMs` of 0 disables it. */
  reset: (initialMs: number, incrementMs: number) => void;
  /** Hands the clock to `side`, banking whatever the previous side used and
   *  crediting them the increment. */
  handOver: (side: Side) => void;
  stop: () => void;
  claimFlag: (side: Side) => void;
};

const empty: ClockState = {
  enabled: false,
  incrementMs: 0,
  remaining: { white: 0, black: 0 },
  running: null,
  since: null,
  flagged: null,
};

function bank(state: ClockState): Record<Side, number> {
  if (!state.running || state.since === null) return state.remaining;
  const used = Date.now() - state.since;
  return {
    ...state.remaining,
    [state.running]: state.remaining[state.running] - used + state.incrementMs,
  };
}

export const useClock = create<ClockState & ClockActions>()(
  persist(
    (set) => ({
      ...empty,
      reset: (initialMs, incrementMs) =>
        set({
          ...empty,
          enabled: initialMs > 0,
          incrementMs,
          remaining: { white: initialMs, black: initialMs },
        }),
      handOver: (side) =>
        set((state) =>
          state.enabled
            ? { remaining: bank(state), running: side, since: Date.now(), flagged: null }
            : state,
        ),
      stop: () =>
        set((state) =>
          state.running
            ? { remaining: bank(state), running: null, since: null }
            : state,
        ),
      claimFlag: (side) =>
        set((state) =>
          state.flagged
            ? state
            : {
                flagged: side,
                running: null,
                since: null,
                remaining: { ...state.remaining, [side]: 0 },
              },
        ),
    }),
    {
      name: "coach-clock",
      version: 1,
      /* `since` is deliberately absent. It is a wall-clock instant, and persisting
         it would drain the clock while the tab was closed — which is right for a
         server-run game and wrong for one that only exists in this browser.
         Closing the tab pauses the clock. */
      partialize: (state) => ({
        enabled: state.enabled,
        incrementMs: state.incrementMs,
        remaining: state.remaining,
        flagged: state.flagged,
      }),
    },
  ),
);

/** Live remaining time for a side, in ms. Read from a render or an interval; it
 *  never allocates and never touches the store. */
export function remainingNow(state: ClockState, side: Side): number {
  if (state.running !== side || state.since === null) return state.remaining[side];
  return state.remaining[side] - (Date.now() - state.since);
}
