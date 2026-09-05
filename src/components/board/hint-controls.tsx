"use client";

import { HelpCircle, Lightbulb, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HintStage } from "@/lib/store/game-store";

const LABEL: Record<HintStage, string> = {
  0: "Hint",
  1: "Show it",
  2: "Hint shown",
};

const TIP: Record<HintStage, string> = {
  0: "Point at the piece the engine would move",
  1: "Draw the move itself",
  2: "You have the engine's move for this position",
};

/* Two buttons, because they answer two different questions: "what should I play"
   and "why". The first discloses in stages so being handed the answer takes a
   deliberate second tap — a hint you have to ask for twice is a nudge, one that
   fires instantly is a crutch. */
export function HintControls({
  stage,
  available,
  thinking = false,
  explaining = false,
  onReveal,
  onExplain,
  className,
}: {
  stage: HintStage;
  /** False until the engine has finished searching this position. */
  available: boolean;
  thinking?: boolean;
  explaining?: boolean;
  onReveal?: () => void;
  onExplain?: () => void;
  className?: string;
}) {
  const exhausted = stage >= 2;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant={stage === 0 ? "secondary" : "ghost"}
            className="h-8 px-2 text-xs"
            disabled={!available || exhausted}
            onClick={onReveal}
          >
            {thinking ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Lightbulb
                className={cn("size-3.5", stage > 0 && "text-arrow-hint")}
                aria-hidden
              />
            )}
            <span className="hidden sm:inline">{LABEL[stage]}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {available ? TIP[stage] : "Waiting for the engine to finish this position"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={!available || explaining}
            onClick={onExplain}
          >
            {explaining ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <HelpCircle className="size-4" aria-hidden />
            )}
            <span className="sr-only">Why is that the best move?</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Why is that the best move?</TooltipContent>
      </Tooltip>
    </div>
  );
}
