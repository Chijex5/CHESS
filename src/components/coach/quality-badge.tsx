import { cn } from "@/lib/utils";
import { QUALITY_GLYPH, QUALITY_LABEL, type MoveQuality } from "@/lib/chess/types";

/** Best → worst. The order the review reads in, so the row is a ladder rather
 *  than a bag of coloured pills. */
export const QUALITY_ORDER: MoveQuality[] = [
  "brilliant",
  "best",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

/* One tone per band, in one place. `-ink` carries the text, the un-suffixed
   token carries fills and rules; nothing paints label text with the mark
   colour, which is what made these read as neon. */
export const QUALITY_TONE: Record<MoveQuality, string> = {
  brilliant: "text-q-brilliant-ink bg-q-brilliant/10 border-q-brilliant/25",
  best: "text-q-best-ink bg-q-best/10 border-q-best/25",
  good: "text-q-good-ink bg-q-good/10 border-q-good/25",
  inaccuracy: "text-q-inaccuracy-ink bg-q-inaccuracy/12 border-q-inaccuracy/30",
  mistake: "text-q-mistake-ink bg-q-mistake/12 border-q-mistake/30",
  blunder: "text-q-blunder-ink bg-q-blunder/12 border-q-blunder/30",
};

/** Text-only tone, for glyphs sitting directly on a surface. */
export const QUALITY_INK: Record<MoveQuality, string> = {
  brilliant: "text-q-brilliant-ink",
  best: "text-q-best-ink",
  good: "text-q-good-ink",
  inaccuracy: "text-q-inaccuracy-ink",
  mistake: "text-q-mistake-ink",
  blunder: "text-q-blunder-ink",
};

/* Annotation glyphs (?? ? ?! ! !!) come straight from chess literature, so the
   badge is readable without colour — which also makes it colour-blind safe. */
export function QualityBadge({
  quality,
  size = "md",
  showLabel = false,
  className,
}: {
  quality: MoveQuality;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const glyph = QUALITY_GLYPH[quality];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border font-medium",
        QUALITY_TONE[quality],
        size === "sm" ? "h-5.5 px-1.5 text-2xs" : "h-6.5 px-2 text-xs",
        className,
      )}
    >
      <span className="tnum font-mono font-bold leading-none">{glyph || "="}</span>
      {showLabel && <span className="leading-none">{QUALITY_LABEL[quality]}</span>}
      <span className="sr-only">{QUALITY_LABEL[quality]}</span>
    </span>
  );
}

/** Compact glyph for the move list, where space is at a premium. */
export function QualityGlyph({ quality }: { quality: MoveQuality }) {
  const glyph = QUALITY_GLYPH[quality];
  if (!glyph) return null;
  return (
    <span
      className={cn("tnum font-mono text-2xs font-bold leading-none", QUALITY_INK[quality])}
      title={QUALITY_LABEL[quality]}
    >
      {glyph}
    </span>
  );
}
