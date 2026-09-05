"use client";

import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { evalToWinPct, formatEval } from "@/lib/chess/eval";
import type { Evaluation } from "@/lib/chess/types";

/* Geometry runs on win%, not raw centipawns: a linear cp bar pegs at ±10 pawns
   and then stops moving, which is exactly where a learner still needs to see
   change. `settled` is false while the search is shallow — the bar shimmers
   rather than thrashing as depth climbs. */
export function EvalBar({
  evaluation,
  orientation = "vertical",
  settled = true,
  showNumber = true,
  hidden = false,
  flipped = false,
  className,
}: {
  evaluation: Evaluation;
  orientation?: "vertical" | "horizontal";
  settled?: boolean;
  showNumber?: boolean;
  hidden?: boolean;
  flipped?: boolean;
  className?: string;
}) {
  const winPct = evalToWinPct(evaluation);
  const whiteShare = Math.max(2, Math.min(98, winPct));
  const label = formatEval(evaluation);
  const whiteAhead = winPct >= 50;

  /* Withheld, not missing. A dashed box containing the word "hidden" reads as an
     unfinished component; a hatched rail with a struck-through eye reads as a
     value the player has chosen to cover, which is what it is. */
  if (hidden) {
    return (
      <div
        className={cn(
          "hatch flex items-center justify-center rounded-full ring-1 ring-inset ring-border",
          orientation === "vertical" ? "w-2.5" : "h-2.5 w-full",
          className,
        )}
        title="Evaluation covered until the coach has spoken"
        aria-label="Evaluation covered"
      >
        <EyeOff
          className={cn(
            "size-3 shrink-0 text-muted-foreground/70",
            orientation === "vertical" ? "" : "hidden",
          )}
          aria-hidden
        />
      </div>
    );
  }

  const isVertical = orientation === "vertical";
  // White grows from whichever end its own pieces are on.
  const blackFirst = !flipped;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        isVertical ? "h-full flex-col" : "w-full flex-row-reverse",
        className,
      )}
      role="meter"
      aria-valuenow={Math.round(winPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Evaluation ${label}, white winning chances ${Math.round(winPct)} percent`}
    >
      {showNumber && (
        <span
          className={cn(
            "tnum shrink-0 font-mono text-2xs font-semibold",
            /* A vertical bar is 10px wide; the number beside it is 30, and on a
               phone that difference is 6% of the board. The bar alone still says
               who is ahead, and the exact figure is on every coach card. */
            isVertical && "hidden sm:block",
            whiteAhead ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      )}
      <div
        className={cn(
          "relative overflow-hidden rounded-full bg-piece-dark ring-1 ring-inset ring-border",
          isVertical ? "w-2.5 flex-1" : "h-2.5 w-full",
          !settled && "animate-pulse",
        )}
      >
        <div
          className={cn(
            "absolute bg-piece-light transition-[width,height] duration-300 ease-out",
            isVertical
              ? blackFirst
                ? "inset-x-0 bottom-0"
                : "inset-x-0 top-0"
              : blackFirst
                ? "inset-y-0 left-0"
                : "inset-y-0 right-0",
          )}
          style={isVertical ? { height: `${whiteShare}%` } : { width: `${whiteShare}%` }}
        />
        {/* Equality line — the reference a bar without numbers still needs. */}
        <div
          className={cn(
            "absolute bg-board-frame/70",
            isVertical ? "inset-x-0 h-px" : "inset-y-0 w-px",
          )}
          style={isVertical ? { bottom: "50%" } : { left: "50%" }}
        />
      </div>
    </div>
  );
}
