"use client";

import Link from "next/link";
import { Dumbbell, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QualityBadge } from "@/components/coach/quality-badge";
import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";
import { drillsFrom } from "@/lib/game/drill";

/* The drills for a principle are not authored — they are the positions from your
   own game where the coach cited it. That is why this section had to be a
   placeholder until games persisted, and why it is real now: the corpus supplies
   the idea and your game supplies the material. */
export function ConceptDrills({ slug }: { slug: string }) {
  const byPly = useCoach((state) => state.byPly);
  const annotations = sortedAnnotations(byPly);
  const cited = annotations.filter((a) => a.concepts.some((c) => c.slug === slug));
  const drills = drillsFrom(cited);

  return (
    <section className="mt-8 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="size-4 text-primary" aria-hidden />
        Practise it
      </h2>

      {drills.length === 0 ? (
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          No positions yet. When you miss this idea in a game, the position it cost
          you shows up here — and in the practise set — with the answer hidden.
        </p>
      ) : (
        <>
          <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
            {drills.length === 1
              ? "One position from your game turned on this idea."
              : `${drills.length} positions from your game turned on this idea.`}{" "}
            They are dealt back with the answer hidden.
          </p>
          <ul className="mt-3 space-y-1.5">
            {drills.map((drill) => (
              <li
                key={drill.ply}
                className="flex items-center gap-2.5 rounded-lg border bg-background/50 px-3 py-2"
              >
                <QualityBadge quality={drill.quality} size="sm" />
                <span className="tnum font-mono text-sm font-semibold">
                  {drill.moveNumber}
                  {drill.ply % 2 === 1 ? "." : "…"} {drill.playedSan}
                </span>
                <span className="tnum ms-auto text-xs text-muted-foreground">
                  gave up {drill.lostPct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
          <Button asChild size="sm" className="mt-3">
            <Link href="/practise">
              <Play className="size-3.5" aria-hidden /> Run the practise set
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}
