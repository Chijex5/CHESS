"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* ── One line, over time ──────────────────────────────────────────────────────
   Single series, single hue, and no legend — the heading says what is plotted, and a
   legend box with one swatch would only restate it.

   Deliberately not the move-quality colours the rest of the app uses. Those are a
   tight severity ramp (teal → green → amber → orange → red) built for badges that also
   carry a glyph, so identity never rests on hue there. Fed to a palette validator as a
   chart palette they fail on adjacent separation — `best` and `good` sit 4.5 ΔE apart
   to normal vision. So charts here use one hue and let length and position carry the
   data, which is what those channels are for.
   ─────────────────────────────────────────────────────────────────────────── */

export type Point = { x: number; y: number };

const W = 640;
const H = 180;
const PAD = { top: 14, right: 44, bottom: 22, left: 34 };

export function LineChart({
  points,
  label,
  format = (value: number) => String(Math.round(value)),
  formatX = (value: number) => new Date(value).toLocaleDateString(),
  /** Forces the y-axis to include these, for a scale that means something — an
   *  accuracy chart should be read against 100, not against its own best game. */
  includeY = [],
  className,
}: {
  points: Point[];
  /** What one point is, for the tooltip and the table. */
  label: string;
  format?: (value: number) => string;
  formatX?: (value: number) => string;
  includeY?: number[];
  className?: string;
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const shape = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const ys = [...sorted.map((p) => p.y), ...includeY];
    const lowest = Math.min(...ys);
    const highest = Math.max(...ys);
    /* A flat series would divide by zero, and a series with any range gets a tenth of
       it as breathing room so the line is never pinned to the frame. */
    const span = highest - lowest || Math.max(1, Math.abs(highest) * 0.1);
    const min = lowest - span * 0.1;
    const max = highest + span * 0.1;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const xAt = (index: number) =>
      PAD.left + (sorted.length < 2 ? plotW / 2 : (index / (sorted.length - 1)) * plotW);
    const yAt = (value: number) => PAD.top + plotH - ((value - min) / (max - min)) * plotH;

    return {
      sorted,
      min,
      max,
      xAt,
      yAt,
      coords: sorted.map((point, index) => ({ ...point, cx: xAt(index), cy: yAt(point.y) })),
      // Three ticks: enough to read a level off, few enough to stay recessive.
      ticks: [min, (min + max) / 2, max],
    };
  }, [points, includeY]);

  if (points.length === 0) return null;

  const { coords, ticks, yAt } = shape;
  const line = coords.map((p, i) => `${i === 0 ? "M" : "L"}${p.cx},${p.cy}`).join(" ");
  const last = coords[coords.length - 1];
  const active = hover === null ? null : coords[hover];

  /* The pointer lands anywhere; the nearest point in x is the one meant. Reading it off
     the viewBox rather than the rendered box means the maths is scale-independent. */
  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * W;
    let nearest = 0;
    for (let i = 1; i < coords.length; i += 1) {
      if (Math.abs(coords[i].cx - x) < Math.abs(coords[nearest].cx - x)) nearest = i;
    }
    setHover(nearest);
  };

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${label} over time, ${points.length} games. The table below has every value.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={H} />
          </clipPath>
        </defs>

        {/* Hairline, solid, one step off the surface. Never dashed. */}
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yAt(value)}
              y2={yAt(value)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={yAt(value) + 3}
              textAnchor="end"
              className="tnum fill-muted-foreground text-[9px]"
            >
              {format(value)}
            </text>
          </g>
        ))}

        {/* The hue at a tenth, a wash rather than a block. */}
        <path
          d={`${line} L${last.cx},${H - PAD.bottom} L${coords[0].cx},${H - PAD.bottom} Z`}
          className="fill-primary/10"
          clipPath={`url(#${clipId})`}
        />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {active && (
          <line
            x1={active.cx}
            x2={active.cx}
            y1={PAD.top}
            y2={H - PAD.bottom}
            className="stroke-muted-foreground/40"
            strokeWidth={1}
          />
        )}

        {/* Endpoint marker: r=4 is the 8px floor, with a 2px surface ring so it stays
            legible where it crosses the line or a gridline. */}
        <circle cx={last.cx} cy={last.cy} r={4} className="fill-primary stroke-card" strokeWidth={2} />
        {active && active !== last && (
          <circle
            cx={active.cx}
            cy={active.cy}
            r={4}
            className="fill-primary stroke-card"
            strokeWidth={2}
          />
        )}

        {/* One direct label, at the end — never a number on every point. */}
        <text
          x={last.cx + 8}
          y={last.cy + 3}
          className="tnum fill-foreground text-[10px] font-semibold"
        >
          {format(last.y)}
        </text>
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-2xs shadow-sm"
          style={{ left: `${(active.cx / W) * 100}%`, top: `${(active.cy / H) * 100}%` }}
        >
          <span className="tnum font-mono font-semibold">{format(active.y)}</span>
          <span className="ms-1.5 text-muted-foreground">{formatX(active.x)}</span>
        </div>
      )}

      {/* Not decoration: the palette check flags this hue as under 3:1 in one mode, and
          a table is the relief that makes the values readable regardless. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-2xs text-muted-foreground hover:text-foreground">
          Show the numbers
        </summary>
        <table className="mt-1.5 w-full text-2xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-0.5 text-start font-medium">When</th>
              <th className="py-0.5 text-end font-medium">{label}</th>
            </tr>
          </thead>
          <tbody className="tnum font-mono">
            {[...coords].reverse().map((point) => (
              <tr key={point.x} className="border-t">
                <td className="py-0.5">{formatX(point.x)}</td>
                <td className="py-0.5 text-end">{format(point.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
