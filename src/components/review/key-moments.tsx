"use client";

import { cn } from "@/lib/utils";
import { ChessBoard } from "@/components/board/chess-board";
import { QualityBadge } from "@/components/coach/quality-badge";
import { formatEval } from "@/lib/chess/eval";
import { splitUci } from "@/lib/game/notation";
import type { Annotation, PlyRecord } from "@/lib/chess/types";

/** The three biggest swings, each as a thumbnail of the position *before* the
 *  move, with both arrows drawn. Enough to recognise the pattern at a glance. */
export function KeyMoments({
  annotations,
  plies,
  bestMoveAt,
  onSelect,
  className,
}: {
  annotations: Annotation[];
  plies: PlyRecord[];
  /** UCI best move for the position before ply n. */
  bestMoveAt: (ply: number) => string | null;
  onSelect?: (ply: number) => void;
  className?: string;
}) {
  const top = [...annotations]
    .filter((a) => a.quality !== "best" && a.quality !== "brilliant")
    .sort(
      (a, b) =>
        Math.abs(b.winPctBefore - b.winPctAfter) -
        Math.abs(a.winPctBefore - a.winPctAfter),
    )
    .slice(0, 3);

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {top.map((a) => {
        const record = plies[a.ply - 1];
        const best = bestMoveAt(a.ply);
        const arrows = record
          ? [
              { from: record.from, to: record.to, kind: "played" as const },
              ...(best
                ? [{ ...splitUci(best), kind: "best" as const }]
                : []),
            ]
          : [];
        return (
          <button
            key={a.ply}
            type="button"
            onClick={() => onSelect?.(a.ply)}
            className="rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/30"
          >
            <div className="flex items-center gap-2">
              <span className="tnum font-mono text-sm font-semibold">
                {a.moveNumber}
                {a.side === "white" ? "." : "…"} {a.playedSan}
              </span>
              <QualityBadge quality={a.quality} size="sm" />
              <span className="tnum ms-auto font-mono text-2xs text-muted-foreground">
                −{Math.abs(a.winPctBefore - a.winPctAfter).toFixed(0)}%
              </span>
            </div>
            <div className="mt-2.5">
              <ChessBoard
                fen={a.fenBefore}
                coordinates={false}
                arrows={arrows}
              />
            </div>
            <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
              <span className="tnum font-mono">
                {formatEval(a.evalBefore)} → {formatEval(a.evalAfter)}
              </span>
              <span>· better was</span>{" "}
              <span className="rounded bg-q-best/10 px-1 py-0.5 font-mono font-semibold text-q-best-ink">
                {a.bestSan}
              </span>
            </p>
          </button>
        );
      })}
    </div>
  );
}
