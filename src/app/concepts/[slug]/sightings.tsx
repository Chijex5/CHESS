"use client";

import Link from "next/link";
import { QualityBadge } from "@/components/coach/quality-badge";
import { plainProse } from "@/components/coach/coach-prose";
import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";

/** Where this principle came up in the game currently in memory. Annotations are
 *  client state, so this is the one part of the page that cannot be static. */
export function ConceptSightings({ slug }: { slug: string }) {
  const byPly = useCoach((state) => state.byPly);
  const seen = sortedAnnotations(byPly).filter((annotation) =>
    annotation.concepts.some((concept) => concept.slug === slug),
  );

  return (
    <section className="mt-8">
      <h2 className="eyebrow">
        Where it came up
      </h2>
      {seen.length === 0 ? (
        <p className="mt-2 font-serif text-sm text-muted-foreground">
          Not cited in your current game.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {seen.map((annotation) => (
            <li key={annotation.ply}>
              <Link
                href="/review"
                className="flex items-start gap-2.5 rounded-lg border bg-card p-3 transition-colors hover:border-primary/30"
              >
                <span className="tnum shrink-0 font-mono text-sm font-semibold">
                  {annotation.moveNumber}
                  {annotation.side === "white" ? "." : "\u2026"} {annotation.playedSan}
                </span>
                <QualityBadge quality={annotation.quality} size="sm" />
                <span className="line-clamp-2 font-serif text-sm leading-snug text-muted-foreground">
                  {plainProse(annotation.prose)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
