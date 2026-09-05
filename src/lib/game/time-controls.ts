/* ── Time controls ────────────────────────────────────────────────────────────
   Off by default, and that is a deliberate choice rather than an unfinished one.
   This app expects you to stop and read a paragraph about the move you just
   played, take it back, and ask for a hint. A clock running through all of that
   turns coaching into a penalty, so the clock is something you opt into once you
   want the pressure — which is exactly when it starts being useful practice.
   ─────────────────────────────────────────────────────────────────────────── */
export type TimeControlId = "unlimited" | "blitz3" | "blitz5" | "rapid10" | "rapid15";

export type TimeControl = {
  id: TimeControlId;
  label: string;
  /** Starting time per side, ms. 0 means no clock. */
  initialMs: number;
  /** Added to your own clock after each of your moves, ms. */
  incrementMs: number;
  note: string;
};

export const TIME_CONTROLS: TimeControl[] = [
  {
    id: "unlimited",
    label: "No clock",
    initialMs: 0,
    incrementMs: 0,
    note: "Think as long as you like, and read every note before you move.",
  },
  { id: "blitz3", label: "3 min", initialMs: 180_000, incrementMs: 0, note: "Blitz. Pattern recognition only — there is no time to calculate." },
  { id: "blitz5", label: "5 min", initialMs: 300_000, incrementMs: 0, note: "Blitz with room for one long think per game." },
  { id: "rapid10", label: "10 min", initialMs: 600_000, incrementMs: 0, note: "Rapid. Enough to check your move before you play it." },
  {
    id: "rapid15",
    label: "15 | 10",
    initialMs: 900_000,
    incrementMs: 10_000,
    note: "Rapid with increment. The clock stops being the thing that beats you.",
  },
];

export const TIME_CONTROL_BY_ID = new Map(TIME_CONTROLS.map((t) => [t.id, t]));

export function timeControlFor(id: TimeControlId): TimeControl {
  return TIME_CONTROL_BY_ID.get(id) ?? TIME_CONTROLS[0];
}

/** `m:ss`, or `m:ss.t` under twenty seconds — the point at which tenths start
 *  mattering more than a tidy readout. Never shows a negative clock. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms);
  const total = clamped / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  if (clamped < 20_000) {
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }
  return `${minutes}:${Math.floor(seconds).toString().padStart(2, "0")}`;
}
