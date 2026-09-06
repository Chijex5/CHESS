"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { connectionBars, useOnline } from "@/lib/store/online-store";

/* ── The connection meter ─────────────────────────────────────────────────────
   Four bars rather than the word "Connecting", because the interesting states are
   not binary: a connection can be up and slow, or up and dropping heartbeats, and
   both matter to someone with thirty seconds on their clock.

   It re-renders on a timer because staleness is a function of *now*: a stream that
   went quiet ten seconds ago looks identical to a healthy one until you look at the
   clock. This is the only thing on the online board that ticks besides the clocks,
   and it ticks slowly.
   ─────────────────────────────────────────────────────────────────────────── */
const LABEL: Record<number, string> = {
  0: "Disconnected",
  1: "Weak connection",
  2: "Fair connection",
  3: "Good connection",
  4: "Strong connection",
};

export function ConnectionBars({ className }: { className?: string }) {
  const connection = useOnline((state) => state.connection);
  const [, setNow] = useState(0);

  /* One second is enough: the thresholds are in tens of seconds, and a meter that
     updated per animation frame would be a lie about its own precision. */
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const state = useOnline.getState();
  /* Nothing to be late for once the game is over — the server closes the stream on
     purpose, and reporting that as a weak connection is alarming and false. */
  if (state.snapshot && state.snapshot.status !== "active") return null;

  const bars = connectionBars(state);
  const rtt = state.rttMs;

  const tone =
    bars >= 3
      ? "bg-q-best"
      : bars === 2
        ? "bg-q-inaccuracy"
        : "bg-q-blunder";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("flex shrink-0 items-end gap-[2px]", className)}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={bars}
          aria-label={
            rtt === null
              ? LABEL[bars]
              : `${LABEL[bars]}, ${rtt} millisecond round trip`
          }
        >
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              /* Heights climb so the meter reads at a glance without colour, which
                 is the same reason the move-quality badges carry glyphs. */
              className={cn(
                "w-[3px] rounded-sm transition-colors",
                level === 1 && "h-1.5",
                level === 2 && "h-2.5",
                level === 3 && "h-3.5",
                level === 4 && "h-[18px]",
                level <= bars ? tone : "bg-border",
                // A dropped connection pulses; a slow one does not need the alarm.
                connection === "reconnecting" && level <= bars && "animate-pulse",
              )}
              aria-hidden
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {LABEL[bars]}
        {rtt !== null && <span className="ms-1.5 font-mono opacity-70">{rtt}ms</span>}
        {connection === "reconnecting" && (
          <span className="ms-1.5 opacity-70">· reconnecting</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
