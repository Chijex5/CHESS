"use client";

import Link from "next/link";
import { Frown, Handshake, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Confetti } from "./confetti";
import type { GameSnapshot } from "@/lib/multiplayer/protocol";

/* ── The end of an online game ────────────────────────────────────────────────
   The engine game's dialog leads with accuracy, because two searches per move ran
   while you played and the number is already there. Nothing ran here — no engine
   help was allowed — so this one leads with the only things that are known the
   instant the game ends: what happened, to whom, and what it did to your rating.

   Analysis is offered rather than presented. Claiming an accuracy figure the moment
   the game ends would mean either inventing one or freezing the screen for the
   eighty searches it actually takes.
   ─────────────────────────────────────────────────────────────────────────── */

/** How the game ended, in a sentence rather than an enum. */
const ENDING: Record<string, string> = {
  checkmate: "by checkmate",
  resignation: "by resignation",
  timeout: "on time",
  stalemate: "by stalemate",
  "insufficient-material": "for want of material",
  threefold: "by repetition",
  "fifty-move": "by the fifty-move rule",
  agreement: "by agreement",
  abandoned: "by abandonment",
};

export function OnlineOverDialog({
  snapshot,
  open,
  onOpenChange,
}: {
  snapshot: GameSnapshot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { seat, winner, ending } = snapshot;
  const outcome: "win" | "loss" | "draw" =
    winner === "draw" || !winner || !seat ? "draw" : winner === seat ? "win" : "loss";

  const opponent = seat === "white" ? snapshot.black : snapshot.white;
  const Icon = outcome === "win" ? Trophy : outcome === "loss" ? Frown : Handshake;

  const headline =
    outcome === "win" ? "You won" : outcome === "loss" ? "You lost" : "Draw";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="overflow-hidden p-0 sm:max-w-sm">
        {outcome === "win" && <Confetti fire={open} />}

        <div className="relative px-5 pt-6 text-center">
          <span
            className={cn(
              "mx-auto grid size-12 place-items-center rounded-2xl",
              outcome === "win"
                ? "bg-q-best/12 text-q-best-ink"
                : outcome === "loss"
                  ? "bg-q-mistake/12 text-q-mistake-ink"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-6" aria-hidden />
          </span>
          <DialogTitle
            className={cn(
              "mt-3 text-xl font-semibold tracking-tight",
              outcome === "win" && "text-q-best-ink",
              outcome === "loss" && "text-q-mistake-ink",
            )}
          >
            {headline}
          </DialogTitle>
          <DialogDescription className="mt-1 font-serif text-base">
            {ending ? ENDING[ending] ?? ending : ""}
            {opponent && <> · against {opponent.username}</>}
          </DialogDescription>
        </div>

        {snapshot.rated && seat && (
          <div className="mt-4 px-5">
            {snapshot.ratings ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                <span className="text-2xs text-muted-foreground">Rating</span>
                <span className="tnum font-mono text-sm text-muted-foreground line-through">
                  {snapshot.ratings[seat].before}
                </span>
                <span className="tnum font-mono text-lg font-semibold">
                  {snapshot.ratings[seat].after}
                </span>
                {(() => {
                  const delta =
                    snapshot.ratings[seat].after - snapshot.ratings[seat].before;
                  if (delta === 0) return null;
                  return (
                    <span
                      className={cn(
                        "tnum font-mono text-xs font-semibold",
                        delta > 0 ? "text-q-best-ink" : "text-q-mistake-ink",
                      )}
                    >
                      {delta > 0 ? "+" : "−"}
                      {Math.abs(delta)}
                    </span>
                  );
                })()}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Working out the new ratings…
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 border-t bg-muted/20 p-4">
          {/* Deliberately not "See your stats": there are none yet. This starts the
              analysis the engine game does as it goes, which for a finished game is
              two searches per move and takes a visible few seconds. */}
          <Button asChild size="lg" className="h-11">
            <Link href={`/g/${snapshot.id}/analyse`}>
              <Sparkles className="size-4" aria-hidden /> Analyse this game
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/play/friend">
              <RotateCcw className="size-4" aria-hidden /> New game
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
