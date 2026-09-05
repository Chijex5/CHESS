"use client";

import { CornerUpLeft, Eye, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "./quality-badge";
import { ConceptChip } from "./concept-chip";
import { CoachProse } from "./coach-prose";
import { formatEval } from "@/lib/chess/eval";
import type { Annotation, Concept } from "@/lib/chess/types";

const STAGE_TEXT: Record<Annotation["stage"], string> = {
  queued: "Queued",
  analyzing: "Searching to depth 18…",
  retrieving: "Retrieving principles…",
  streaming: "Explaining…",
  complete: "",
  error: "Explanation unavailable",
};

/* The card is never empty. Played move, better move, eval swing and severity all
   come from the engine synchronously, so they paint on the first frame; only the
   prose streams in. If the coach request fails outright, what's left is still a
   useful annotation. */
export function AnnotationCard({
  annotation,
  active = false,
  onSelect,
  onShow,
  onRetry,
  onConcept,
  className,
}: {
  annotation: Annotation;
  active?: boolean;
  onSelect?: (a: Annotation) => void;
  onShow?: (a: Annotation) => void;
  onRetry?: (a: Annotation) => void;
  onConcept?: (c: Concept) => void;
  className?: string;
}) {
  const {
    moveNumber,
    side,
    playedSan,
    bestSan,
    evalBefore,
    evalAfter,
    quality,
    stage,
    prose,
    concepts,
    pvSan,
    winPctBefore,
    winPctAfter,
  } = annotation;
  const isPraise = quality === "best" || quality === "brilliant";
  const drop = Math.abs(winPctBefore - winPctAfter);
  const pending = stage === "queued" || stage === "analyzing" || stage === "retrieving";

  return (
    <article
      onClick={() => onSelect?.(annotation)}
      className={cn(
        "rounded-xl border bg-card p-3.5 text-left transition-colors",
        onSelect && "cursor-pointer hover:border-primary/25",
        active ? "border-primary/45 ring-1 ring-primary/20" : "border-border",
        className,
      )}
      aria-busy={pending || stage === "streaming"}
    >
      {/* ── Facts: available the instant the engine returns ── */}
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="tnum font-mono text-sm font-semibold">
          {moveNumber}
          {side === "white" ? "." : "…"} {playedSan}
        </span>
        <QualityBadge quality={quality} size="sm" showLabel />
        <span className="tnum ms-auto font-mono text-2xs text-muted-foreground">
          {formatEval(evalBefore)} → {formatEval(evalAfter)}
        </span>
      </header>

      {!isPraise && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span>Better:</span>
          <span className="rounded bg-q-best/10 px-1.5 py-0.5 font-mono font-semibold text-q-best-ink">
            {bestSan}
          </span>
          <span>
            · gave up <span className="tnum font-medium">{drop.toFixed(1)}%</span> of
            your winning chances
          </span>
        </p>
      )}

      {/* ── Prose: streams, and never gates anything above ── */}
      <div className="mt-2.5 min-h-14">
        {pending ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {STAGE_TEXT[stage]}
            </p>
            <Skeleton className="h-3 w-[92%]" />
            <Skeleton className="h-3 w-[78%]" />
          </div>
        ) : stage === "error" ? (
          <p className="flex items-start gap-1.5 font-serif text-sm text-muted-foreground">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-q-inaccuracy-ink"
              aria-hidden
            />
            {STAGE_TEXT.error} — the engine facts above still stand.
          </p>
        ) : (
          <p className="font-serif text-base leading-relaxed text-card-foreground/90">
            <CoachProse
              prose={prose}
              streaming={stage === "streaming"}
              onConcept={onConcept}
            />
            {stage === "streaming" && (
              <span
                className="ms-0.5 inline-block h-3.5 w-0.5 translate-y-px animate-pulse bg-primary align-baseline"
                aria-hidden
              />
            )}
          </p>
        )}
      </div>

      {concepts.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {concepts.map((c) => (
            <ConceptChip
              key={c.slug}
              concept={c}
              onSelect={(picked) => onConcept?.(picked)}
            />
          ))}
        </div>
      )}

      {pvSan.length > 0 && stage === "complete" && (
        <p className="mt-2.5 truncate font-mono text-2xs text-muted-foreground">
          {pvSan.join(" ")}
        </p>
      )}

      <footer className="mt-3 flex items-center gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onShow?.(annotation);
          }}
        >
          <Eye className="size-3.5" aria-hidden /> Show me
        </Button>
        {!isPraise && onRetry && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(annotation);
            }}
          >
            <CornerUpLeft className="size-3.5" aria-hidden /> Retry move
          </Button>
        )}
      </footer>
    </article>
  );
}
