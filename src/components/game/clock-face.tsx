"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/game/time-controls";
import type { Side } from "@/lib/chess/types";

/** Below this, tenths are shown and the readout turns urgent. */
export const LOW_MS = 20_000;

/* ── The one component that re-renders on a timer ─────────────────────────────
   Extracted so the local clock and the online one share it. They differ only in
   where the number comes from — banked in a client store, or projected from a
   server-stamped snapshot — and that difference is the `read` callback.

   Reading imperatively rather than subscribing to a ticking store value is the
   whole point: nothing else in the app learns that a second has passed, so the
   board and the coach panel are not repainted 240 times a minute.
   ─────────────────────────────────────────────────────────────────────────── */
export function ClockFace({
  side,
  read,
  running,
  onFlag,
  className,
}: {
  side: Side;
  /** Remaining ms, called on every tick. Must be cheap and must not allocate. */
  read: () => number;
  /** Whether this side's clock is counting down right now. */
  running: () => boolean;
  /** Called once, the first time this side reaches zero. */
  onFlag?: (side: Side) => void;
  className?: string;
}) {
  const [state, setState] = useState(() => ({ ms: read(), live: running() }));
  const flagged = useRef(false);

  /* The callbacks change identity on every parent render, and putting them in the
     dependency array would restart the timer each time. Held in a ref so the loop
     starts once and always calls the current version — written in an effect rather
     than during render, which React forbids and which would also be a lie under
     concurrent rendering, where a render can be thrown away. */
  const latest = useRef({ read, running, onFlag });
  useEffect(() => {
    latest.current = { read, running, onFlag };
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const { read: r, running: isRunning, onFlag: flag } = latest.current;
      const ms = r();
      const live = isRunning();
      setState({ ms, live });

      if (ms <= 0 && !flagged.current) {
        flagged.current = true;
        flag?.(side);
      }
      if (ms > 0) flagged.current = false;

      /* Fast enough that tenths move smoothly when shown, slow enough that a
         fifteen-minute game is not nine thousand renders. */
      timer = setTimeout(tick, !live ? 500 : ms < LOW_MS ? 100 : 250);
    };
    tick();
    return () => clearTimeout(timer);
  }, [side]);

  const { ms, live } = state;
  const low = ms < LOW_MS;

  return (
    <span
      className={cn(
        "tnum shrink-0 rounded-md px-2 py-0.5 font-mono text-sm font-semibold tabular-nums",
        live ? "bg-foreground/8" : "bg-transparent text-muted-foreground",
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
