"use client";

import { HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoachProse } from "./coach-prose";
import { ConceptChip } from "./concept-chip";
import type { Concept } from "@/lib/chess/types";

/* Sits under the board, not in the coach feed. The feed is the record of the game
   you played; this is advice about a move you have not made, and filing it with the
   former would make the transcript claim credit you did not earn. */
export function HintCard({
  move,
  stage,
  prose,
  concepts,
  onConcept,
  className,
}: {
  /** SAN of the move being explained. */
  move: string;
  stage: "idle" | "streaming" | "complete" | "error";
  prose: string;
  concepts: Concept[];
  onConcept?: (c: Concept) => void;
  className?: string;
}) {
  if (stage === "idle") return null;

  return (
    <aside
      className={cn(
        "rounded-xl border border-arrow-hint/40 bg-arrow-hint/[0.06] p-3",
        className,
      )}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-xs">
        <HelpCircle className="size-3.5 shrink-0 text-arrow-hint" aria-hidden />
        <span className="text-muted-foreground">Why</span>
        <span className="tnum rounded bg-arrow-hint/12 px-1.5 py-0.5 font-mono text-sm font-semibold">
          {move}
        </span>
        {stage === "streaming" && !prose && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
        )}
      </p>

      {stage === "error" ? (
        <p className="mt-1.5 font-serif text-sm text-muted-foreground">
          Could not reach the coach — the arrow on the board still stands.
        </p>
      ) : (
        <p className="mt-1.5 font-serif text-base leading-relaxed text-card-foreground/90">
          <CoachProse
            prose={prose}
            streaming={stage === "streaming"}
            onConcept={onConcept}
          />
        </p>
      )}

      {concepts.length > 0 && stage === "complete" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {concepts.map((c) => (
            <ConceptChip key={c.slug} concept={c} onSelect={onConcept} />
          ))}
        </div>
      )}
    </aside>
  );
}
