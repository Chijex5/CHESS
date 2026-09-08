"use client";

import { cn } from "@/lib/utils";
import type { Record3 } from "@/lib/game/statistics";
import { winRate } from "@/lib/game/statistics";

/* A record, as one bar rather than three numbers. Won / drawn / lost in that order,
   separated by a 2px gap in the surface colour rather than by strokes — the gap is what
   makes neighbouring segments read as distinct, and a border would add ink that is not
   data.

   The three segments are the one place the app's severity hues genuinely belong in a
   chart: won, drawn and lost are a status triple, not a categorical series, and each is
   labelled in the row beside it, so identity never rests on colour. */
export function RecordBar({
  record,
  label,
  className,
}: {
  record: Record3;
  label: string;
  className?: string;
}) {
  const rate = winRate(record);
  const pct = (value: number) => (record.games === 0 ? 0 : (value / record.games) * 100);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="tnum shrink-0 font-mono text-xs">
          {rate === null ? "—" : `${Math.round(rate * 100)}%`}
        </span>
      </div>

      <div
        className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-sm"
        role="img"
        aria-label={`${label}: ${record.wins} won, ${record.draws} drawn, ${record.losses} lost`}
      >
        {record.games === 0 ? (
          <span className="flex-1 bg-muted" />
        ) : (
          <>
            {record.wins > 0 && (
              <span className="bg-q-best" style={{ width: `${pct(record.wins)}%` }} />
            )}
            {record.draws > 0 && (
              <span className="bg-muted-foreground/40" style={{ width: `${pct(record.draws)}%` }} />
            )}
            {record.losses > 0 && (
              <span className="bg-q-blunder" style={{ width: `${pct(record.losses)}%` }} />
            )}
          </>
        )}
      </div>

      <p className="tnum mt-1 font-mono text-2xs text-muted-foreground">
        {record.wins}W · {record.draws}D · {record.losses}L
      </p>
    </div>
  );
}

/** Label, value, and an optional line of context. Not a chart, on purpose: one number
 *  is best rendered as one number. */
export function StatTile({
  label,
  value,
  note,
  className,
}: {
  label: string;
  /** Already formatted. Proportional figures rather than tabular — a lone value at
   *  this size looks loose when every digit is the width of a zero. */
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-2xs text-muted-foreground">{note}</p>}
    </div>
  );
}
