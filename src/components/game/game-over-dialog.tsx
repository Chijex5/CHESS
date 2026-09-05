"use client";

import Link from "next/link";
import { Dumbbell, Frown, Handshake, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { QualityTally } from "@/components/coach/quality-tally";
import { QualityBadge } from "@/components/coach/quality-badge";
import { Confetti } from "./confetti";
import type { GameStats } from "@/lib/game/stats";
import type { GameResult, Side } from "@/lib/chess/types";

/* ── The end of the game ──────────────────────────────────────────────────────
   Chess.com's game-over modal runs a quick review on the device and puts the
   result in front of you with three ways out — rematch, new game, full review.
   That is the pattern here, for the same reason it works there: the moment you
   are most willing to look at what went wrong is the second after it happened,
   and a one-line banner under the board is not an invitation.

   Every figure below is already computed. `gameStats` is the same function the
   review page calls, so nothing here is a second opinion.
   ─────────────────────────────────────────────────────────────────────────── */

type Tone = "win" | "loss" | "draw";

const HEADLINE: Record<Tone, { Icon: typeof Trophy; ring: string; ink: string }> = {
  win: { Icon: Trophy, ring: "bg-q-best/12 text-q-best-ink", ink: "text-q-best-ink" },
  loss: { Icon: Frown, ring: "bg-q-mistake/12 text-q-mistake-ink", ink: "text-q-mistake-ink" },
  draw: { Icon: Handshake, ring: "bg-muted text-muted-foreground", ink: "text-foreground" },
};

/** The one question the player is actually asking, phrased for the outcome. */
const PRIMARY: Record<Tone, string> = {
  win: "See your stats",
  loss: "See what went wrong",
  draw: "See how close it was",
};

export function GameOverDialog({
  result,
  stats,
  playerSide,
  drillCount,
  open,
  onOpenChange,
  onNewGame,
}: {
  result: GameResult;
  stats: GameStats;
  playerSide: Side;
  /** Positions the practise route can deal back, so the button is only offered
   *  when there is something behind it. */
  drillCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewGame: () => void;
}) {
  const tone: Tone = result.playerWon === null ? "draw" : result.playerWon ? "win" : "loss";
  const { Icon, ring, ink } = HEADLINE[tone];
  const mine = stats.accuracy[playerSide];
  const theirs = stats.accuracy[playerSide === "white" ? "black" : "white"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="overflow-hidden p-0 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          // Focusing the first button would put a ring on "See what went wrong"
          // before the player has read the result they are being shown.
          event.preventDefault();
        }}
      >
        {tone === "win" && <Confetti fire={open} />}

        <div className="relative px-5 pt-6 text-center">
          <span className={cn("mx-auto grid size-12 place-items-center rounded-2xl", ring)}>
            <Icon className="size-6" aria-hidden />
          </span>
          <DialogTitle className={cn("mt-3 text-xl font-semibold tracking-tight", ink)}>
            {result.outcome}
          </DialogTitle>
          <DialogDescription className="mt-1 font-serif text-base">
            {result.detail}
          </DialogDescription>
        </div>

        <div className="mt-5 space-y-3 px-5">
          {/* Accuracy side by side, because a 74 means nothing until you can see
              it against the engine's 96 — or against its 61. */}
          <div className="flex items-stretch gap-2">
            <Figure label="Your accuracy" value={mine} emphasis />
            <Figure label="Stockfish" value={theirs} />
          </div>

          <QualityTally qualities={stats.qualities} />

          {stats.worst && (
            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-left">
              <QualityBadge quality={stats.worst.quality} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">
                  Your costliest move
                </span>
                <span className="tnum font-mono text-sm font-semibold">
                  {stats.worst.moveNumber}
                  {stats.worst.side === "white" ? "." : "…"} {stats.worst.playedSan}
                </span>
                <span className="tnum text-xs text-muted-foreground">
                  {" "}
                  gave up {stats.worstLostPct.toFixed(0)}%
                </span>
              </span>
            </div>
          )}

          {stats.hintedCount > 0 && (
            <p className="tnum text-center text-2xs text-muted-foreground">
              {stats.hintedCount} {stats.hintedCount === 1 ? "move" : "moves"} played with a
              hint, and not counted as your own.
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t bg-muted/20 p-4">
          <Button asChild size="lg" className="h-11">
            <Link href="/review">
              <Sparkles className="size-4" aria-hidden /> {PRIMARY[tone]}
            </Link>
          </Button>
          <div className="flex gap-2">
            {drillCount > 0 && (
              <Button asChild variant="secondary" className="flex-1">
                <Link href="/practise">
                  <Dumbbell className="size-4" aria-hidden /> Practise {drillCount}
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              className={cn(drillCount > 0 ? "flex-1" : "w-full")}
              onClick={onNewGame}
            >
              <RotateCcw className="size-4" aria-hidden /> New game
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Accuracy, or a dash. A null reading means the engine never finished searching
 *  some of the game — printing 0 there would be a lie about a very short game. */
function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border px-3 py-2",
        emphasis ? "border-primary/30 bg-primary/[0.06]" : "bg-muted/30",
      )}
    >
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className="tnum font-mono text-xl font-semibold leading-tight">
        {value === null ? "—" : value.toFixed(0)}
      </p>
    </div>
  );
}
