"use client";

import { Frown, Handshake, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameSnapshot } from "@/lib/multiplayer/protocol";

/* ── What happened ────────────────────────────────────────────────────────────
   The result, said once. Two surfaces show it — the dialog that opens over the
   board the moment the game ends, and the summary page both players land on after
   it — and they must not drift: a rating delta that reads +12 in one and +11 in the
   other looks invented. So the outcome, the sentence and the rating arithmetic live
   here and both surfaces render this.
   ─────────────────────────────────────────────────────────────────────────── */

/** How the game ended, in a sentence rather than an enum. */
export const ENDING: Record<string, string> = {
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

export type Outcome = "win" | "loss" | "draw";

/** The result from your chair. A spectator, or a game with no winner recorded, reads
 *  as a draw — the neutral rendering, not a claim. */
export function outcomeOf(snapshot: Pick<GameSnapshot, "seat" | "winner">): Outcome {
  const { seat, winner } = snapshot;
  if (winner === "draw" || !winner || !seat) return "draw";
  return winner === seat ? "win" : "loss";
}

export function GameResultCard({
  snapshot,
  as: Headline = "h1",
  className,
}: {
  snapshot: GameSnapshot;
  /** The headline element. The dialog passes its `DialogTitle` so the result is what
   *  a screen reader announces on open; the page uses a plain heading. */
  as?: React.ElementType;
  className?: string;
}) {
  const { seat, ending } = snapshot;
  const outcome = outcomeOf(snapshot);
  const opponent = seat === "white" ? snapshot.black : snapshot.white;
  const Icon = outcome === "win" ? Trophy : outcome === "loss" ? Frown : Handshake;
  const headline =
    outcome === "win" ? "You won" : outcome === "loss" ? "You lost" : "Draw";

  return (
    <div className={cn("text-center", className)}>
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
      <Headline
        className={cn(
          "mt-3 text-xl font-semibold tracking-tight",
          outcome === "win" && "text-q-best-ink",
          outcome === "loss" && "text-q-mistake-ink",
        )}
      >
        {headline}
      </Headline>
      <p className="mt-1 font-serif text-base text-muted-foreground">
        {ending ? (ENDING[ending] ?? ending) : ""}
        {opponent && <> · against {opponent.username}</>}
      </p>

      {snapshot.rated && seat && (
        <div className="mt-4">
          {snapshot.ratings ? (
            <RatingChange before={snapshot.ratings[seat].before} after={snapshot.ratings[seat].after} />
          ) : (
            <p className="text-sm text-muted-foreground">Working out the new ratings…</p>
          )}
        </div>
      )}
    </div>
  );
}

function RatingChange({ before, after }: { before: number; after: number }) {
  const delta = after - before;
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
      <span className="text-2xs text-muted-foreground">Rating</span>
      <span className="tnum font-mono text-sm text-muted-foreground line-through">
        {before}
      </span>
      <span className="tnum font-mono text-lg font-semibold">{after}</span>
      {delta !== 0 && (
        <span
          className={cn(
            "tnum font-mono text-xs font-semibold",
            delta > 0 ? "text-q-best-ink" : "text-q-mistake-ink",
          )}
        >
          {delta > 0 ? "+" : "−"}
          {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}
