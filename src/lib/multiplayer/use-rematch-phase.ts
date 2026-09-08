"use client";

import { useEffect, useState } from "react";
import { serverNow } from "@/lib/store/online-store";
import { rematchPhase, type GameSnapshot, type RematchPhase } from "./protocol";

/**
 * The live rematch phase, which two components need and neither can compute alone.
 *
 * The phase depends on the clock as well as on the snapshot: the offer expires on a
 * deadline, and nothing else on a finished board ticks, so a component reading it once
 * per snapshot would sit on a stale answer for as long as the page stayed open. Both
 * the controls and the line they sit in read it from here, so the buttons and the text
 * around them cannot disagree about whether there is still an offer.
 *
 * Two seconds is finer than anyone perceives on a two-minute window, and the timer runs
 * only while there is a window to be inside.
 */
export function useRematchPhase(snapshot: GameSnapshot | null): RematchPhase {
  const finished = snapshot?.status === "finished";
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (!finished) return;
    const timer = setInterval(() => setNow(serverNow()), 2_000);
    return () => clearInterval(timer);
  }, [finished]);

  if (!snapshot) return "unavailable";
  /* `now` is only ever behind — it is refreshed on a timer, not on render — and behind
     means the window looks more open than it is, never less. A click in that couple of
     seconds is refused by the server on the same deadline and the phase catches up, so
     the failure mode is a message rather than a game nobody can join. */
  return rematchPhase(snapshot, now);
}
