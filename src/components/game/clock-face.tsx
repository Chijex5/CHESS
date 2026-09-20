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

   ── On the size ──────────────────────────────────────────────────────────────
   This used to be 13px — the same size as the player's name beside it, the same
   size as every label in the app, because the type scale says interface text is
   13px and the chrome must not compete with the board. That rule is right for the
   review page and wrong here, and it is most of why a live game read as a web page
   with a chessboard on it: when everything is the same size, nothing is happening.

   Lichess sets its clock at 2.8em, rising to 3.6em on a tall screen, with a bar
   that drains beneath it. The clock is the second-loudest object on a game screen
   after the board itself, because after the position it is the only thing that
   changes and the only thing that can lose you the game on its own. So: a slab,
   in the biggest numerals the row can carry, dimmed when it is not your turn and
   bright when it is.
   ─────────────────────────────────────────────────────────────────────────── */
export function ClockFace({
  side,
  read,
  running,
  onFlag,
  /** Starting time, for the drain bar. Without it the bar is not drawn — an
   *  unlimited game has nothing to drain. */
  total,
  className,
}: {
  side: Side;
  /** Remaining ms, called on every tick. Must be cheap and must not allocate. */
  read: () => number;
  /** Whether this side's clock is counting down right now. */
  running: () => boolean;
  /** Called once, the first time this side reaches zero. */
  onFlag?: (side: Side) => void;
  total?: number;
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
  const out = ms <= 0;
  /* How much of the original time is left, for the bar. Clamped because increment
     can push a clock above where it started, and a bar past 100% would overflow
     its slab. */
  const fraction = total ? Math.max(0, Math.min(1, ms / total)) : null;

  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md px-2.5 py-1 transition-colors",
        /* Running is bright and still is dim. This is the whole "whose move is it"
           signal at a glance, from across the room, without reading a word. */
        live ? "bg-foreground/10 text-foreground" : "bg-muted/40 text-muted-foreground",
        low && ms > 0 && live && "bg-q-blunder/15 text-q-blunder-ink",
        out && "bg-q-blunder/25 text-q-blunder-ink",
        className,
      )}
      aria-label={`${side === "white" ? "White" : "Black"} clock, ${formatClock(ms)}`}
    >
      <span
        className={cn(
          "tnum block text-center font-mono font-semibold leading-none tabular-nums",
          /* 28px on a phone, 36px from `sm`. Against the 13px of every label around
             it, that is the hierarchy a game screen needs and a document does not.
             `min-w` holds the slab still when the readout gains tenths under 20s —
             a clock that jumps sideways as it gets urgent is the worst moment for it. */
          "min-w-[3.6ch] text-[1.75rem] tracking-[0.04em] sm:text-[2.25rem]",
          /* The last twenty seconds pulse. Reduced-motion users get the colour and
             the tenths, which carry the same message without the movement. */
          low && ms > 0 && live && "motion-safe:animate-pulse",
        )}
      >
        {formatClock(ms)}
      </span>

      {/* The bar drains left to right as the clock empties: the time remaining as a
          quantity you can see without reading a number. Transform rather than width,
          so four ticks a second cost a composite and not a layout. */}
      {fraction !== null && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-current opacity-45 transition-transform duration-200 ease-linear"
          style={{ transform: `scaleX(${fraction})` }}
        />
      )}
    </span>
  );
}
