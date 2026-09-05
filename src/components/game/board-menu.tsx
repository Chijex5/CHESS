"use client";

import { useState } from "react";
import {
  CornerUpLeft,
  Flag,
  FlipVertical2,
  MoreHorizontal,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* ── Everything you need rarely ───────────────────────────────────────────────
   The controls row used to hold ten buttons: four transport arrows, flip, retry,
   hint, why, settings and resign. Ten equally-weighted buttons is the same as no
   emphasis at all, and one of them ended a game on a single tap.

   The two things touched every move — stepping through the game, and asking for a
   hint — stay outside. The rest live behind one glyph, which is where chess.com
   keeps board settings and where every desktop app keeps its destructive verbs.
   Resign now costs a confirmation, because it is the only irreversible thing on
   this screen.
   ─────────────────────────────────────────────────────────────────────────── */
export function BoardMenu({
  onFlip,
  onRetry,
  canRetry = false,
  onNewGame,
  onSettings,
  onResign,
  canResign = true,
}: {
  onFlip?: () => void;
  onRetry?: () => void;
  canRetry?: boolean;
  onNewGame?: () => void;
  onSettings?: () => void;
  onResign?: () => void;
  canResign?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8">
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">Board menu</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Flip, take back, settings, resign</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onRetry?.()} disabled={!canRetry}>
            <CornerUpLeft className="size-4" aria-hidden />
            Take the move back
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onFlip?.()}>
            <FlipVertical2 className="size-4" aria-hidden />
            Flip the board
            <DropdownMenuShortcut>F</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onSettings?.()}>
            <Settings2 className="size-4" aria-hidden />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNewGame?.()}>
            <RotateCcw className="size-4" aria-hidden />
            Start a new game
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!canResign}
            onSelect={() => setConfirming(true)}
          >
            <Flag className="size-4" aria-hidden />
            Resign
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Resign this game?</DialogTitle>
            <DialogDescription className="font-serif text-base">
              The game ends as a loss and the coach writes up what it has. The moves
              and the notes stay, so you can still review and practise them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep playing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onResign?.();
              }}
            >
              <Flag className="size-4" aria-hidden /> Resign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
