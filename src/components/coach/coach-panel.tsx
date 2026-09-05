"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AnnotationCard } from "./annotation-card";
import type { Annotation, Concept } from "@/lib/chess/types";

export function CoachPanel({
  annotations,
  activePly,
  onShow,
  onRetry,
  onConcept,
  onSelect,
  showHeader = true,
  className,
}: {
  annotations: Annotation[];
  activePly?: number;
  onShow?: (a: Annotation) => void;
  onRetry?: (a: Annotation) => void;
  onConcept?: (c: Concept) => void;
  onSelect?: (ply: number) => void;
  /** Off when the surrounding surface already names the panel — a sheet with
   *  its own title does not need a second "Coach" heading under it. */
  showHeader?: boolean;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  // Autoscroll only while the user is already at the bottom; otherwise show a
  // pill so an arriving card never yanks them away from what they're reading.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pinned) return;
    el.scrollTop = el.scrollHeight;
  }, [annotations, pinned]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  const live = annotations.filter(
    (a) => a.stage === "streaming" || a.stage === "retrieving" || a.stage === "analyzing",
  ).length;

  return (
    <section
      className={cn("flex min-h-0 flex-col rounded-xl border bg-sidebar", className)}
      aria-label="Coach commentary"
    >
      {showHeader && (
        <header className="flex shrink-0 items-center gap-2 border-b px-3.5 py-2.5">
          <MessageSquareQuote className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Coach</h2>
          {live > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/12 px-2 py-0.5 text-2xs font-medium text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
              writing
            </span>
          )}
          <span className="tnum ms-auto font-mono text-2xs text-muted-foreground">
            {annotations.length} {annotations.length === 1 ? "note" : "notes"}
          </span>
        </header>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="scrollbar-thin absolute inset-0 space-y-2.5 overflow-y-auto p-3"
        >
          {annotations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <MessageSquareQuote className="size-7 text-muted-foreground/40" aria-hidden />
              <p className="text-sm font-medium">No notes yet</p>
              <p className="font-serif text-sm leading-relaxed text-muted-foreground">
                Play a move. When the engine sees a better one, the reason for it
                lands here — while it is still your opponent&apos;s turn.
              </p>
            </div>
          ) : (
            annotations.map((a) => (
              <AnnotationCard
                key={a.ply}
                annotation={a}
                active={a.ply === activePly}
                onSelect={(picked) => onSelect?.(picked.ply)}
                onShow={onShow}
                onRetry={onRetry}
                onConcept={onConcept}
              />
            ))
          )}
        </div>

        {!pinned && annotations.length > 0 && (
          <Button
            size="sm"
            className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 rounded-full px-3 text-xs shadow-lg"
            onClick={() => {
              setPinned(true);
              const el = scroller.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
          >
            <ArrowDown className="size-3.5" aria-hidden /> Latest
          </Button>
        )}
      </div>
    </section>
  );
}
