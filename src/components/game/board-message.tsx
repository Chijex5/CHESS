"use client";

import { Loader2, Scale, TriangleAlert, Trophy } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type BoardMessage =
  | { kind: "engine-error"; text: string }
  | { kind: "result"; text: string; won: boolean | null }
  | { kind: "thinking" }
  /** Who is winning, in words. The quietest thing this row ever holds. */
  | { kind: "standing"; text: string }
  | null;

/* ── One line, one message ────────────────────────────────────────────────────
   The board used to be followed by a stack: a hint card, then possibly a hanging-
   piece warning, then possibly a result banner, each an `Alert` with its own icon
   and border. Three of them at once is why this screen read as busy — and every
   one of them resized the board on arrival.

   There is one row now, it holds the single most urgent thing, and it is the same
   height whatever it holds. Nothing below the board moves.
   ─────────────────────────────────────────────────────────────────────────── */
export function BoardMessageLine({
  message,
  className,
}: {
  message: BoardMessage;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-9 shrink-0 items-center gap-2 px-0.5", className)}
      aria-live="polite"
    >
      {message?.kind === "standing" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Scale className="size-3.5 shrink-0 opacity-70" aria-hidden />
          {message.text}
        </p>
      )}

      {message?.kind === "thinking" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Stockfish is thinking…
        </p>
      )}

      {message?.kind === "engine-error" && (
        <p className="flex min-w-0 items-center gap-2 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{message.text}</span>
        </p>
      )}

      {message?.kind === "result" && (
        <>
          <Trophy
            className={cn(
              "size-3.5 shrink-0",
              message.won === null
                ? "text-muted-foreground"
                : message.won
                  ? "text-q-best-ink"
                  : "text-q-mistake-ink",
            )}
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate text-xs font-medium">{message.text}</p>
          <Button asChild size="sm" variant="secondary" className="h-7 shrink-0 text-xs">
            <Link href="/review">Review</Link>
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * A hanging-piece warning blocks the attempted move, so it needs to take focus
 * where the player is looking. Keeping it out of the compact status row also
 * prevents the controls from being pushed out of view on narrow screens.
 */
export function RiskWarningDialog({
  risk,
  onLookAgain,
  onPlayAnyway,
}: {
  risk: { reason: string } | null;
  onLookAgain: () => void;
  onPlayAnyway: () => void;
}) {
  return (
    <Dialog
      open={Boolean(risk)}
      onOpenChange={(open) => {
        if (!open) onLookAgain();
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-q-inaccuracy-ink" aria-hidden />
            Your piece is hanging
          </DialogTitle>
          <DialogDescription>{risk?.reason}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onLookAgain}>
            Look again
          </Button>
          <Button onClick={onPlayAnyway}>Play it anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
