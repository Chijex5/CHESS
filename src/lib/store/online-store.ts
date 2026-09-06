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
  /** Set for one update when the opponent arrives, so the UI can react to the moment
   *  rather than to the state. */
  justStarted: boolean;
  /** When the last heartbeat or snapshot arrived. Staleness is the only signal that
   *  distinguishes a quiet game from a dead connection: both look identical if you
   *  only watch for messages. */
  lastBeatAt: number;
  /** Whether the first request of this session has been and gone. See `observeRtt`. */
  warmed: boolean;
  /** Recent round trips, newest last. Kept rather than averaged because the useful
   *  statistic is the minimum — see `rttMs`. */
  rttSamples: number[];
  /** Best recent round trip in ms, or null before anything has been measured.
   *
   *  The *minimum* of the window, not the mean. A single sample can include a cold
   *  serverless start or a dev-server compile — the first measurement on this page was
   *  3.2 seconds for that reason — and a mean lets one such spike libel the network
   *  for minutes. The minimum is the closest estimate of the path's actual latency,
   *  which is what "signal strength" is being asked about, and it still degrades
   *  honestly because old samples age out of the window. */
  rttMs: number | null;
};

type OnlineActions = {
  open: (gameId: string) => void;
  applySnapshot: (snapshot: GameSnapshot) => void;
  setConnection: (connection: Connection) => void;
  /** A heartbeat or snapshot arrived. */
  beat: () => void;
  /** A measured round trip. */
  observeRtt: (ms: number) => void;
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
  justStarted: false,
  lastBeatAt: 0,
  warmed: false,
  rttSamples: [],
  rttMs: null,
};

export const useOnline = create<OnlineState & OnlineActions>()((set) => ({
  ...empty,
  open: (gameId) => set({ ...empty, gameId }),
  applySnapshot: (snapshot) =>
    set((state) => ({
      lastBeatAt: Date.now(),
      /** True on the render where the game turned from pending into active. */
      justStarted:
        state.snapshot?.status === "pending" && snapshot.status === "active",
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
  beat: () => set({ lastBeatAt: Date.now() }),
  observeRtt: (ms) =>
    set((state) => {
      /* The first request of a session is discarded, not recorded. On Vercel it
         includes a cold start, and on a dev server a route compile — this page
         measured 3.2 seconds for exactly that reason. Neither is a fact about the
         network, and the meter is answering a question about the network. */
      if (!state.warmed) return { warmed: true };
      // Five samples at one every thirty seconds is about two minutes of memory:
      // long enough to shrug off one spike, short enough to notice a real change.
      const rttSamples = [...state.rttSamples, ms].slice(-5);
      return { rttSamples, rttMs: Math.min(...rttSamples) };
    }),
  setPending: (pending) => set({ pending }),
  reject: (rejection) => set({ rejection }),
  close: () => set({ ...empty }),
}));

/** Server time, as this browser can best estimate it. */
export function serverNow(): number {
  return Date.now() + useOnline.getState().clockSkew;
}

/** How healthy the connection looks, 0 (gone) to 4 (good).
 *
 *  Two signals, because neither is sufficient alone. Round-trip time says how fast
 *  the link is but says nothing when nothing is being sent; heartbeat staleness says
 *  the stream is alive but nothing about its speed. A turn-based game spends most of
 *  its life idle, so the staleness half is what actually catches a dead connection —
 *  and it is why the server pings at all.
 *
 *  The server beats every 10s, so anything past ~25s means messages are being lost
 *  rather than merely delayed. */
export function connectionBars(state: {
  connection: Connection;
  lastBeatAt: number;
  rttMs: number | null;
  now?: number;
}): 0 | 1 | 2 | 3 | 4 {
  if (state.connection === "closed") return 0;
  /* Before the first message there is nothing measured. Three bars — "assume fine" —
     rather than one, because a fresh page briefly showing a red meter reads as a
     problem with the network rather than with the first round trip. */
  if (state.lastBeatAt === 0) return state.connection === "reconnecting" ? 1 : 3;
  if (state.connection === "connecting") return 2;
  if (state.connection === "reconnecting") return 1;

  const now = state.now ?? Date.now();
  const stale = state.lastBeatAt === 0 ? Infinity : now - state.lastBeatAt;
  if (stale > 25_000) return 1;
  if (stale > 15_000) return 2;

  const rtt = state.rttMs;
  if (rtt === null) return 3;
  if (rtt < 180) return 4;
  if (rtt < 450) return 3;
  if (rtt < 1_000) return 2;
  return 1;
}
