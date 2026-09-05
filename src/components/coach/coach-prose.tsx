"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { conceptForTerm } from "@/lib/coach/concepts";
import type { Concept } from "@/lib/chess/types";

const TERM = /\[\[([^\]]{1,40})\]\]/g;

/** The coach's prose with the term markup removed, for places that show a single
 *  truncated line and cannot render a chip — a dock preview, a document title, a
 *  screen-reader announcement. Anywhere prose is shown raw, the brackets leak. */
export function plainProse(prose: string): string {
  return prose.replace(/\[\[|\]\]/g, "");
}

type Piece =
  | { text: string; concept?: undefined }
  | { text: string; concept: Concept };

/* The coach wraps its own jargon in [[double brackets]]. Terms the corpus teaches
   become buttons into the concept drawer; the rest lose their brackets and read as
   ordinary prose, so a response that ignores the convention is indistinguishable
   from one written before it existed. */
function split(prose: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of prose.matchAll(TERM)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push({ text: prose.slice(last, at) });
    const term = match[1];
    const concept = conceptForTerm(term);
    pieces.push(concept ? { text: term, concept } : { text: term });
    last = at + match[0].length;
  }
  if (last < prose.length) pieces.push({ text: prose.slice(last) });
  return pieces;
}

export function CoachProse({
  prose,
  /* Streaming text arrives a few characters at a time, so a term can be split
     across two chunks — "[[han" then "ging]]". Linkifying mid-stream would flicker
     and mis-match, so the raw brackets are stripped until the note is finished. */
  streaming = false,
  onConcept,
  className,
}: {
  prose: string;
  streaming?: boolean;
  onConcept?: (concept: Concept) => void;
  className?: string;
}) {
  const pieces = useMemo(
    () => (streaming ? null : split(prose)),
    [prose, streaming],
  );

  if (!pieces) {
    return <span className={className}>{plainProse(prose)}</span>;
  }

  return (
    <span className={className}>
      {pieces.map((piece, i) =>
        piece.concept ? (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConcept?.(piece.concept);
            }}
            title={piece.concept.blurb}
            className={cn(
              "font-medium text-foreground underline decoration-primary/50",
              "decoration-dotted underline-offset-2 transition-colors",
              "hover:decoration-primary hover:decoration-solid",
            )}
          >
            {piece.text}
          </button>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </span>
  );
}
