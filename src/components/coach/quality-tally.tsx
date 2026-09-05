import { cn } from "@/lib/utils";
import { QUALITY_GLYPH, QUALITY_LABEL, type MoveQuality } from "@/lib/chess/types";
import { QUALITY_ORDER, QUALITY_TONE } from "./quality-badge";

/** "2 Inaccuracy" is the kind of thing that gives a product away. */
const PLURAL: Partial<Record<MoveQuality, string>> = {
  brilliant: "Brilliant",
  best: "Best moves",
  good: "Good moves",
  inaccuracy: "Inaccuracies",
  mistake: "Mistakes",
  blunder: "Blunders",
};

function label(quality: MoveQuality, count: number) {
  return count === 1 ? QUALITY_LABEL[quality] : (PLURAL[quality] ?? QUALITY_LABEL[quality]);
}

export function tallyOf(qualities: MoveQuality[]) {
  const counts = new Map<MoveQuality, number>();
  for (const quality of qualities) counts.set(quality, (counts.get(quality) ?? 0) + 1);
  return QUALITY_ORDER.filter((q) => counts.has(q)).map((q) => ({
    quality: q,
    count: counts.get(q)!,
  }));
}

/* One tile per band, in scale order, sized alike. The count is the figure the
   eye should land on, so it is the only thing set large; the glyph sits in a
   tinted chip and the name goes underneath in the same grey as every other
   caption in the app. Colour tints the chip and nothing else. */
export function QualityTally({
  qualities,
  className,
}: {
  qualities: MoveQuality[];
  className?: string;
}) {
  const rows = tallyOf(qualities);

  if (rows.length === 0) {
    return (
      <p className={cn("font-serif text-sm text-muted-foreground", className)}>
        Nothing crossed your explanation threshold — no move lost enough to be
        worth a note.
      </p>
    );
  }

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {rows.map(({ quality, count }) => (
        <li
          key={quality}
          /* 8rem is the width at which "Inaccuracies" fits without truncating,
             which also lands two tiles per row on a 390px phone. */
          className="flex min-w-32 flex-1 items-center gap-2 rounded-lg border bg-background/40 px-2.5 py-1.5"
        >
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-md border font-mono text-xs font-bold",
              QUALITY_TONE[quality],
            )}
            aria-hidden
          >
            {QUALITY_GLYPH[quality] || "="}
          </span>
          <span className="min-w-0">
            <span className="tnum block font-mono text-base font-semibold leading-none">
              {count}
            </span>
            <span className="mt-0.5 block text-2xs text-muted-foreground">
              {label(quality, count)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
