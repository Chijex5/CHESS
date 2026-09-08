"use client";

import { cn } from "@/lib/utils";

/* ── Bars, read as a list ─────────────────────────────────────────────────────
   Horizontal because the labels are words — concept names, opening moves — and words
   read along the axis they are written on. One hue: length already carries magnitude,
   and colouring each bar differently would encode the same fact twice while claiming
   the categories are unrelated when they are the same measurement.

   Every row is directly labelled, so nothing here depends on hue at all.
   ─────────────────────────────────────────────────────────────────────────── */

export type BarRow = {
  key: string;
  label: React.ReactNode;
  /** Drives the bar. */
  value: number;
  /** What to print at the tip. Defaults to the value. */
  display?: string;
  /** A second line under the label — "in 3 games", "won 2 of 5". */
  note?: string;
};

export function BarList({
  rows,
  max,
  className,
}: {
  rows: BarRow[];
  /** Shared scale across the list. Defaults to the largest row. */
  max?: number;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const ceiling = Math.max(max ?? 0, ...rows.map((row) => row.value), 1);

  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm">{row.label}</span>
            <span className="tnum shrink-0 font-mono text-xs font-semibold">
              {row.display ?? row.value}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {/* 8px tall — well under the 24px cap — with the data end rounded and the
                baseline end square, so the bar reads as growing from the axis. */}
            <div className="h-2 min-w-0 flex-1 rounded-e-sm bg-muted">
              <div
                className="h-2 rounded-e-sm bg-primary"
                style={{ width: `${Math.max(2, (row.value / ceiling) * 100)}%` }}
              />
            </div>
          </div>
          {row.note && (
            <p className="mt-0.5 text-2xs text-muted-foreground">{row.note}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
