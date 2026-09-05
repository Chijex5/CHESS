"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { remainingNow, useClock } from "@/lib/store/clock-store";
import { formatClock } from "@/lib/game/time-controls";
import type { Side } from "@/lib/chess/types";

/** Below this, tenths are shown and the readout turns urgent. */
const LOW_MS = 20_000;

/* The only component in the app that re-renders on a timer. It reads the clock
   store imperatively rather than subscribing to a ticking value, so the board and
   the coach panel never learn that a second has passed. */
export function Clock({
  side,
  onFlag,
  className,
}: {
  side: Side;
  /** Called once, when this side's time reaches zero. */
  onFlag?: (side: Side) => void;
  className?: string;
}) {
  const enabled = useClock((state) => state.enabled);
  /* Both values come off the same tick. Reading `running` from the store during
     render instead would be an impure read of a value that changes without a
     subscription — right answer most of the time, and wrong after a hydration. */
  const [{ ms, running }, setTick] = useState(() => ({
    ms: remainingNow(useClock.getState(), side),
    running: useClock.getState().running === side,
  }));
  const flagged = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const state = useClock.getState();
      const left = remainingNow(state, side);
      setTick({ ms: left, running: state.running === side });

      if (left <= 0 && !flagged.current) {
        flagged.current = true;
        state.claimFlag(side);
        onFlag?.(side);
      }

      /* Fast enough that tenths move smoothly when they are shown, slow enough
         that a fifteen-minute game is not 9,000 renders. */
      const delay = state.running !== side ? 500 : left < LOW_MS ? 100 : 250;
      timer = setTimeout(tick, delay);
    };
    tick();
    return () => clearTimeout(timer);
  }, [enabled, side, onFlag]);

  if (!enabled) return null;

  const low = ms < LOW_MS;

  return (
    <span
      className={cn(
        "tnum shrink-0 rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
        running ? "bg-foreground/8" : "bg-transparent text-muted-foreground",
        low && ms > 0 && "text-q-blunder-ink",
        ms <= 0 && "bg-q-blunder/15 text-q-blunder-ink",
        className,
      )}
      aria-label={`${side === "white" ? "White" : "Black"} clock, ${formatClock(ms)}`}
    >
      {formatClock(ms)}
    </span>
  );
}
