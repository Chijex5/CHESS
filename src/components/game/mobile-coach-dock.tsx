"use client";

import { useState } from "react";
import { ChevronUp, ListOrdered, MessageSquareQuote, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { QualityBadge } from "@/components/coach/quality-badge";
import { CoachPanel } from "@/components/coach/coach-panel";
import { plainProse } from "@/components/coach/coach-prose";
import { MoveList, type MoveListRow } from "./move-list";
import type { Annotation, Concept } from "@/lib/chess/types";

type Tab = "coach" | "moves";

function isPending(a: Annotation | undefined) {
  return a?.stage === "streaming" || a?.stage === "retrieving" || a?.stage === "analyzing";
}

/* Phone layout: the board keeps the whole viewport, and the newest note peeks
   above the fold with its engine facts already filled in. One tap opens the full
   feed — commentary never covers the position it is talking about. */
export function MobileCoachDock({
  annotations,
  rows,
  activePly,
  moveCount,
  onSelect,
  onConcept,
  onRetry,
}: {
  annotations: Annotation[];
  rows: MoveListRow[];
  activePly?: number;
  moveCount: number;
  onSelect?: (ply: number) => void;
  onConcept?: (c: Concept) => void;
  onRetry?: () => void;
}) {
  const [tab, setTab] = useState<Tab | null>(null);
  const latest = annotations.at(-1);
  const pending = isPending(latest);

  const segment = (value: Tab, Icon: typeof MessageSquareQuote, text: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      aria-current={tab === value}
      className={cn(
        "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
        "bg-secondary text-secondary-foreground active:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0 opacity-70" aria-hidden />
      {text}
      <span className="tnum rounded bg-background/70 px-1.5 py-0.5 font-mono text-2xs">
        {count}
      </span>
      {value === "coach" && pending && (
        <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
      )}
    </button>
  );

  return (
    <>
      <div className="sticky bottom-0 z-30 -mx-3 mt-1 space-y-2 border-t bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-sm lg:hidden">
        {latest ? (
          <button
            type="button"
            onClick={() => setTab("coach")}
            className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left active:bg-accent"
          >
            <QualityBadge quality={latest.quality} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="tnum font-mono text-sm font-semibold">
                  {latest.moveNumber}
                  {latest.side === "white" ? "." : "…"} {latest.playedSan}
                </span>
                {pending && (
                  <span className="text-2xs text-muted-foreground">writing…</span>
                )}
              </span>
              <span className="mt-0.5 block truncate font-serif text-xs text-muted-foreground">
                {plainProse(latest.prose) || `Better: ${latest.bestSan}`}
              </span>
            </span>
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        ) : (
          <p className="px-0.5 text-center text-xs text-muted-foreground">
            Coach notes land here as you play.
          </p>
        )}
        <div className="flex gap-2">
          {segment("coach", MessageSquareQuote, "Coach", annotations.length)}
          {segment("moves", ListOrdered, "Moves", moveCount)}
        </div>
      </div>

      <Sheet open={tab !== null} onOpenChange={(v) => !v && setTab(null)}>
        {/* The height needs the same `data-[side=bottom]:` prefix the primitive
            uses, or tailwind-merge keeps both and the primitive's `h-auto` wins
            on selector specificity — which collapses the sheet to a 170px sliver. */}
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="data-[side=bottom]:h-[86svh] gap-0 rounded-t-2xl p-0"
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden />

          <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
            <SheetTitle className="sr-only">
              {tab === "moves" ? "Moves" : "Coach commentary"}
            </SheetTitle>
            <div className="flex flex-1 gap-1 rounded-lg bg-muted p-1">
              {(["coach", "moves"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    "h-8 flex-1 rounded-md text-sm font-medium capitalize transition-colors",
                    tab === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {value}
                  <span className="tnum ms-1.5 font-mono text-2xs opacity-60">
                    {value === "coach" ? annotations.length : moveCount}
                  </span>
                </button>
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={() => setTab(null)}
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          <div className="min-h-0 flex-1 border-t pb-[env(safe-area-inset-bottom)]">
            {tab === "moves" ? (
              <MoveList
                rows={rows}
                activePly={activePly}
                onSelect={(p) => {
                  onSelect?.(p);
                  setTab(null);
                }}
              />
            ) : (
              <CoachPanel
                annotations={annotations}
                activePly={activePly}
                onSelect={onSelect}
                onConcept={onConcept}
                onShow={(a) => {
                  onSelect?.(a.ply);
                  setTab(null);
                }}
                onRetry={() => {
                  onRetry?.();
                  setTab(null);
                }}
                showHeader={false}
                className="h-full rounded-none border-0 bg-transparent"
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
