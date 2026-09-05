"use client";

import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Concept } from "@/lib/chess/types";

/** Opened from a citation chip: what was retrieved, and where it came from. */
export function ConceptDrawer({
  concept,
  onOpenChange,
}: {
  concept: Concept | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={Boolean(concept)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 pb-4 sm:max-w-md">
        {concept && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" aria-hidden />
                <Badge variant="secondary" className="text-2xs uppercase">
                  {concept.family}
                </Badge>
              </div>
              <SheetTitle className="text-xl">{concept.name}</SheetTitle>
              <SheetDescription className="font-serif text-base leading-relaxed">
                {concept.blurb}
              </SheetDescription>
            </SheetHeader>
            {/* Enough to act on without leaving the game: the pattern to look for
                and when it applies. The worked position and the drills from your
                own games are a tap further, on the page. */}
            <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4">
              {concept.look && (
                <div>
                  <p className="eyebrow">What to look for</p>
                  <p className="mt-1 font-serif text-base leading-relaxed">
                    {concept.look}
                  </p>
                </div>
              )}
              {concept.when && (
                <div>
                  <p className="eyebrow">When it applies</p>
                  <p className="mt-1 font-serif text-base leading-relaxed">
                    {concept.when}
                  </p>
                </div>
              )}
              {concept.pitfall && (
                <div className="rounded-lg border border-q-inaccuracy/35 bg-q-inaccuracy/[0.06] p-3">
                  <p className="eyebrow">How it goes wrong</p>
                  <p className="mt-1 font-serif text-sm leading-relaxed">
                    {concept.pitfall}
                  </p>
                </div>
              )}
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/concepts/${concept.slug}`}>
                  Worked example and drills
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
