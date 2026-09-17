"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Confetti } from "./confetti";
import { GameResultCard, outcomeOf } from "./game-result-card";
import { RematchControls } from "./rematch-controls";
import { useRematchPhase } from "@/lib/multiplayer/use-rematch-phase";
import type { GameSnapshot } from "@/lib/multiplayer/protocol";

/* ── The end of an online game ────────────────────────────────────────────────
   The engine game's dialog leads with accuracy, because two searches per move ran
   while you played and the number is already there. Nothing ran here — no engine
   help was allowed — so this one leads with the only things that are known the
   instant the game ends: what happened, to whom, and what it did to your rating.

   Then two doors, and a clock on one of them. A finished board used to be a place
   you could sit forever: the dialog offered a rematch and analysis and waited. Most
   people want neither in the first ten seconds — they want to know what happened and
   then be somewhere else — so the summary now takes you there on its own unless you
   do anything at all. Anything: press a button, offer a rematch, receive one, or
   close this to look at the final position. An automatic move that overrode a
   deliberate one would be worse than no automatic move.
   ─────────────────────────────────────────────────────────────────────────── */

/** Long enough to read the result and change your mind; short enough that nobody
 *  wonders whether the page is stuck. */
const COUNTDOWN_MS = 10_000;
const TICK_MS = 200;

export function OnlineOverDialog({
  snapshot,
  open,
  onOpenChange,
}: {
  snapshot: GameSnapshot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const outcome = outcomeOf(snapshot);
  const phase = useRematchPhase(snapshot);
  const offerable = phase === "idle" || phase === "offered" || phase === "received";
  const summaryHref = `/g/${snapshot.id}/summary`;

  /* The clock only runs on an untouched, idle board: a spectator is not pushed
     anywhere, and the moment either player touches the rematch the phase leaves
     "idle" and the clock stops for good. */
  const [remaining, setRemaining] = useState(COUNTDOWN_MS);
  const [halted, setHalted] = useState(false);
  const halt = () => setHalted(true);

  /* A phase change is a stop, not a pause. Coming back to "idle" after an offer was
     cancelled must not restart a clock the player already interrupted. Decided during
     render from the previous phase rather than in an effect, which would be a render
     late and — the lint rule is right — a cascade. */
  const [seenPhase, setSeenPhase] = useState(phase);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase !== "idle") setHalted(true);
  }

  const counting = open && !halted && phase === "idle";

  /* The interval lives exactly as long as `counting` is true: anything that ends the
     countdown flips it, and the cleanup takes the timer with it. */
  useEffect(() => {
    if (!counting) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const left = COUNTDOWN_MS - (Date.now() - startedAt);
      if (left > 0) {
        setRemaining(left);
        return;
      }
      clearInterval(timer);
      /* Replace rather than push: nobody chose this page, so Back should not offer
         them the board again only to be moved off it — the summary has its own way
         back to the position. */
      router.replace(summaryHref);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [counting, router, summaryHref]);

  const seconds = Math.ceil(remaining / 1000);
  const fraction = remaining / COUNTDOWN_MS;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) halt();
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton
        className="overflow-hidden p-0 sm:max-w-sm"
        /* Capture phase, so a press on any button — including the close button and
           the rematch — counts before the button itself does anything. Reading the
           result is fine; touching the dialog means you have decided something. */
        onPointerDownCapture={halt}
        onKeyDownCapture={halt}
      >
        {outcome === "win" && <Confetti fire={open} />}

        <GameResultCard snapshot={snapshot} as={DialogTitle} className="relative px-5 pt-6" />

        <div className="mt-5 flex flex-col gap-2 border-t bg-muted/20 p-4">
          {/* Rematch first, and only for a couple of minutes. Both players are still
              at the board right now, which is the only time the offer means anything.
              It renders nothing once the window has passed, which is why the summary
              is not displaced by it. */}
          <RematchControls snapshot={snapshot} phase={phase} layout="stack" />

          <Button
            asChild
            size="lg"
            /* Leads once there is no rematch to offer, or nobody to offer it to. */
            variant={offerable ? "secondary" : "default"}
            className="relative h-11 overflow-hidden"
          >
            <Link href={summaryHref}>
              <ClipboardList className="size-4" aria-hidden /> Summary
              {counting && (
                <>
                  <span className="tnum ms-1 font-mono text-xs font-normal opacity-70" aria-hidden>
                    · {seconds}s
                  </span>
                  {/* The clock, drawn: the bar drains across the button's base. It is
                      decorative — the sentence below is what a screen reader gets, and
                      it gets it once rather than every second. */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-40"
                    style={{ transform: `scaleX(${fraction})` }}
                  />
                </>
              )}
            </Link>
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/play/friend">
              <Swords className="size-4" aria-hidden /> New game
            </Link>
          </Button>

          <p
            aria-live="polite"
            className={cn(
              "text-center text-2xs text-muted-foreground transition-opacity",
              counting ? "opacity-100" : "opacity-0",
            )}
          >
            {counting
              ? "Going to the summary in a moment. Press anything to stay."
              : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
