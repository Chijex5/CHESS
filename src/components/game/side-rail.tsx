"use client";

import { ListOrdered, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoachPanel } from "@/components/coach/coach-panel";
import { MoveList, type MoveListRow } from "./move-list";
import type { Annotation, Concept } from "@/lib/chess/types";

export type RailTab = "coach" | "moves";

/* ── One rail, two tabs ───────────────────────────────────────────────────────
   This used to be two permanent columns — notation on the left, coach on the
   right — with the board squeezed between them. Lichess's layout brief puts it
   plainly: "the board should occupy as much space as possible", and chess.com
   reaches the same place from the other direction by giving the board one side
   panel and tabbing everything else into it.

   Collapsing to one rail buys the board a whole column, and it also means the
   desktop and the phone now work the same way: the mobile dock has had this exact
   Coach/Moves switch since it was built, so there is one pattern to learn instead
   of three. The notation is one tap away rather than always shouting.
   ─────────────────────────────────────────────────────────────────────────── */
export function SideRail({
  tab,
  onTab,
  annotations,
  rows,
  activePly,
  moveCount,
  writing,
  onSelect,
  onConcept,
  onRetry,
  className,
}: {
  tab: RailTab;
  onTab: (tab: RailTab) => void;
  annotations: Annotation[];
  rows: MoveListRow[];
  activePly?: number;
  moveCount: number;
  /** The coach is mid-sentence. Shown as a dot so a note arriving while you are
   *  reading the notation is noticed without the panel switching under you. */
  writing?: boolean;
  onSelect?: (ply: number) => void;
  onConcept?: (c: Concept) => void;
  onRetry?: () => void;
  className?: string;
}) {
  const tabs = [
    { value: "coach" as const, Icon: MessageSquareQuote, label: "Coach", count: annotations.length },
    { value: "moves" as const, Icon: ListOrdered, label: "Moves", count: moveCount },
  ];

  return (
    <section
      className={cn("surface-raised flex min-h-0 flex-col rounded-xl", className)}
      aria-label={tab === "coach" ? "Coach commentary" : "Moves"}
    >
      <div className="shrink-0 p-2">
        <div className="surface-sunken flex gap-1 rounded-lg p-1" role="tablist">
          {tabs.map(({ value, Icon, label, count }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => onTab(value)}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
                /* The selected tab is the thing sitting proud of the well the pair
                   are cut into — the same raised/sunken pairing the rest of the app
                   now uses, rather than a card with a hairline shadow. */
                tab === value
                  ? "surface-raised text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
              {label}
              <span className="tnum font-mono text-2xs opacity-60">{count}</span>
              {value === "coach" && writing && tab !== "coach" && (
                <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 border-t">
        {/* Taken out of flow so neither panel can report its own height and grow
            the column — 40 moves of notation would otherwise push the page. */}
        <div className="absolute inset-0">
          {tab === "moves" ? (
            rows.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No moves yet.</p>
            ) : (
              <MoveList rows={rows} activePly={activePly} onSelect={onSelect} />
            )
          ) : (
            <CoachPanel
              annotations={annotations}
              activePly={activePly}
              onSelect={onSelect}
              onConcept={onConcept}
              onShow={(a) => onSelect?.(a.ply)}
              onRetry={onRetry}
              showHeader={false}
              className="h-full rounded-none border-0 bg-transparent"
            />
          )}
        </div>
      </div>
    </section>
  );
}
