"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Lightbulb } from "lucide-react";
import { QualityGlyph } from "@/components/coach/quality-badge";
import type { MoveQuality } from "@/lib/chess/types";

type MoveListCell = {
  ply: number;
  san: string;
  quality?: MoveQuality;
  hinted?: boolean;
};

export type MoveListRow = {
  moveNumber: number;
  white?: MoveListCell;
  black?: MoveListCell;
};

export function MoveList({
  rows,
  activePly,
  onSelect,
  className,
}: {
  rows: MoveListRow[];
  activePly?: number;
  onSelect?: (ply: number) => void;
  className?: string;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activePly]);

  const cell = (m: MoveListCell | undefined) =>
    m ? (
      <button
        ref={m.ply === activePly ? activeRef : undefined}
        type="button"
        onClick={() => onSelect?.(m.ply)}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-sm transition-colors",
          "hover:bg-accent",
          m.ply === activePly && "bg-accent font-semibold text-accent-foreground",
        )}
      >
        <span className="truncate">{m.san}</span>
        {m.quality && <QualityGlyph quality={m.quality} />}
        {/* Marked, not hidden. A hinted move that later reads as "Best move" would
            make the review a flattering fiction. */}
        {m.hinted && (
          <Lightbulb
            className="size-3 shrink-0 text-arrow-hint"
            aria-label="played with a hint"
          />
        )}
      </button>
    ) : (
      <span className="px-1.5" />
    );

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-1 p-1.5">
        {rows.map((r) => (
          <div key={r.moveNumber} className="col-span-3 grid grid-cols-subgrid">
            <span className="tnum select-none px-1 py-1 text-right font-mono text-xs text-muted-foreground">
              {r.moveNumber}.
            </span>
            {cell(r.white)}
            {cell(r.black)}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
