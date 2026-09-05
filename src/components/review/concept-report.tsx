"use client";

import { cn } from "@/lib/utils";
import { ConceptChip } from "@/components/coach/concept-chip";
import type { Annotation, Concept } from "@/lib/chess/types";

/* The differentiator. A per-move coach is common; a cross-game pattern report
   is not — and it is the only view that answers "what should I actually go
   practise?". Counts come from the retrieved citations, so it is grounded in
   what the coach actually used rather than a second guess. */
export function ConceptReport({
  annotations,
  onConcept,
  className,
}: {
  annotations: Annotation[];
  onConcept?: (c: Concept) => void;
  className?: string;
}) {
  const counts = new Map<string, { concept: Concept; count: number; plies: number[] }>();
  for (const a of annotations) {
    if (a.quality === "best" || a.quality === "brilliant") continue;
    for (const c of a.concepts) {
      const row = counts.get(c.slug) ?? { concept: c, count: 0, plies: [] };
      row.count += 1;
      row.plies.push(a.moveNumber);
      counts.set(c.slug, row);
    }
  }
  const rows = [...counts.values()].sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));

  if (rows.length === 0) {
    return (
      <p className={cn("font-serif text-sm text-muted-foreground", className)}>
        No recurring themes in this game.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map(({ concept, count, plies }) => (
        <li key={concept.slug} className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <ConceptChip concept={concept} onSelect={onConcept} />
            <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
              {count}× · move{plies.length > 1 ? "s" : ""} {plies.join(", ")}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
