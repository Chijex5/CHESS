"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { evalToWinPct } from "@/lib/chess/eval";
import type { Evaluation, MoveQuality } from "@/lib/chess/types";

export type GraphMarker = { ply: number; quality: MoveQuality };

const MARKER_FILL: Record<MoveQuality, string> = {
  brilliant: "var(--q-brilliant)",
  best: "var(--q-best)",
  good: "var(--q-good)",
  inaccuracy: "var(--q-inaccuracy)",
  mistake: "var(--q-mistake)",
  blunder: "var(--q-blunder)",
};

/* Plotted on win%, not centipawns, for the same reason the bar is: a linear cp
   axis flattens every decisive position into the same corner. y=50 is equality;
   above the line is White. */
export function EvalGraph({
  evals,
  markers = [],
  activePly,
  onSelect,
  className,
}: {
  /** Index 0 = starting position, index n = after ply n. Gaps are carried
   *  forward, so a position still being searched holds the last known value. */
  evals: (Evaluation | null)[];
  markers?: GraphMarker[];
  activePly?: number;
  onSelect?: (ply: number) => void;
  className?: string;
}) {
  const W = 100;
  const H = 34;
  const pts = useMemo(() => {
    const points: { ply: number; x: number; y: number }[] = [];
    let last = 50;
    for (let i = 0; i < evals.length; i += 1) {
      const evaluation = evals[i];
      if (evaluation) last = evalToWinPct(evaluation);
      points.push({
        ply: i,
        x: (i / Math.max(1, evals.length - 1)) * W,
        // Win% 100 (White winning) → y=0.
        y: H - (last / 100) * H,
      });
    }
    return points;
  }, [evals]);

  const line = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const whiteArea = `0,${H / 2} ${line} ${W},${H / 2}`;
  const byPly = new Map(pts.map((p) => [p.ply, p]));

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label="Evaluation across the game"
      >
        {/* Black's half tinted, so "below the line is bad for you" is readable
            without reading any number. */}
        <rect x="0" y={H / 2} width={W} height={H / 2} fill="var(--muted)" opacity="0.55" />
        <polygon points={whiteArea} fill="var(--chart-1)" opacity="0.22" />
        <line
          x1="0"
          y1={H / 2}
          x2={W}
          y2={H / 2}
          stroke="var(--border)"
          strokeWidth="0.3"
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="0.7"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {markers.map((m) => {
          const p = byPly.get(m.ply);
          if (!p) return null;
          return (
            <circle
              key={m.ply}
              cx={p.x}
              cy={p.y}
              r="1.5"
              fill={MARKER_FILL[m.quality]}
              stroke="var(--card)"
              strokeWidth="0.4"
            />
          );
        })}
        {activePly !== undefined && byPly.get(activePly) && (
          <line
            x1={byPly.get(activePly)!.x}
            y1="0"
            x2={byPly.get(activePly)!.x}
            y2={H}
            stroke="var(--primary)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* Invisible hit targets: an SVG polyline is a miserable click surface. */}
      {onSelect && (
        <div className="absolute inset-0 flex">
          {evals.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className="h-full flex-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              aria-label={`Jump to move ${Math.ceil(i / 2)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
