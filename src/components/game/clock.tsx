"use client";

import { remainingNow, useClock } from "@/lib/store/clock-store";
import { ClockFace } from "./clock-face";
import type { Side } from "@/lib/chess/types";

/** The engine game's clock: time is banked in a client store, because the browser
 *  is the only thing that knows about the game. */
export function Clock({
  side,
  onFlag,
  className,
}: {
  side: Side;
  onFlag?: (side: Side) => void;
  className?: string;
}) {
  const enabled = useClock((state) => state.enabled);
  if (!enabled) return null;

  return (
    <ClockFace
      side={side}
      read={() => remainingNow(useClock.getState(), side)}
      running={() => useClock.getState().running === side}
      onFlag={(who) => {
        useClock.getState().claimFlag(who);
        onFlag?.(who);
      }}
      className={className}
    />
  );
}
