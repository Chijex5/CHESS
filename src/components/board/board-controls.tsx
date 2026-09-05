"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* Transport only. Flip, take-back, settings and resign moved into the board menu
   when this row held ten buttons and emphasised none of them; these four are the
   ones a hand rests on. The keys are the real control — the buttons exist for
   touch and for anyone who has not found the keys yet, which is why each tooltip
   names one. */
const ITEMS = [
  { key: "first", Icon: ChevronFirst, label: "First move", keys: "Home" },
  { key: "prev", Icon: ChevronLeft, label: "Previous move", keys: "←" },
  { key: "next", Icon: ChevronRight, label: "Next move", keys: "→" },
  { key: "last", Icon: ChevronLast, label: "Latest position", keys: "End" },
] as const;

export type Step = (typeof ITEMS)[number]["key"];

export function BoardControls({
  onStep,
  atStart = false,
  atEnd = false,
  className,
}: {
  onStep?: (key: Step) => void;
  atStart?: boolean;
  atEnd?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {ITEMS.map(({ key, Icon, label, keys }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              disabled={key === "first" || key === "prev" ? atStart : atEnd}
              onClick={() => onStep?.(key)}
            >
              <Icon className="size-4" aria-hidden />
              <span className="sr-only">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {label}
            <span className="ms-1.5 font-mono opacity-60">{keys}</span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
