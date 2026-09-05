"use client";

import { cn } from "@/lib/utils";
import type { Concept } from "@/lib/chess/types";

/* Family reads from the rule, not the text: a hairline border and a dot in the
   family hue, with the name itself in ordinary foreground. Four saturated text
   colours in a row is what made a list of principles look like a warning panel. */
const FAMILY_TONE: Record<Concept["family"], string> = {
  tactical: "border-q-blunder/35 [--dot:var(--q-blunder)]",
  positional: "border-q-best/35 [--dot:var(--q-best)]",
  endgame: "border-chart-5/45 [--dot:var(--chart-5)]",
  opening: "border-q-inaccuracy/40 [--dot:var(--q-inaccuracy)]",
};

/** A retrieved principle. In production these arrive as `source` parts on the
 *  coach stream, so the citation is auditable rather than asserted. */
export function ConceptChip({
  concept,
  onSelect,
  className,
}: {
  concept: Concept;
  onSelect?: (concept: Concept) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(concept);
      }}
      className={cn(
        "inline-flex h-6.5 items-center gap-1.5 rounded-full border bg-background/60 px-2 text-2xs font-medium",
        "transition-colors hover:bg-accent",
        FAMILY_TONE[concept.family],
        className,
      )}
      title={concept.blurb}
    >
      <span className="size-1.5 rounded-full bg-(--dot)" aria-hidden />
      {concept.name}
    </button>
  );
}
