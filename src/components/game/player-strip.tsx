import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CapturedPieces } from "./captured-pieces";
import type { PieceColor, PieceType } from "@/lib/chess/types";

/** One player's row: name, strength, captured tray. Mirrors the two sides of a
 *  real board so the eye finds "whose turn" without reading. */
export function PlayerStrip({
  name,
  sublabel,
  color,
  captured,
  advantage,
  thinking = false,
  active = false,
  trailing,
  className,
}: {
  name: string;
  sublabel?: string;
  color: PieceColor;
  captured: PieceType[];
  advantage?: number;
  /** Engine is searching for its reply. */
  thinking?: boolean;
  active?: boolean;
  /** Trailing slot, for the clock. Nothing else belongs on this row. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-lg border bg-card px-3 transition-colors",
        active ? "border-primary/45 bg-primary/[0.06]" : "border-border",
        className,
      )}
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/25",
          color === "w" ? "bg-piece-light" : "bg-piece-dark",
          active && "ring-2 ring-primary/60",
        )}
        aria-hidden
      />
      <span className="truncate text-sm font-medium">{name}</span>
      {sublabel && (
        <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
          {sublabel}
        </span>
      )}
      {/* Inline, not stacked. Two lines per row cost the board ~50px of height
          between them, and every real client puts the tray beside the name for
          exactly that reason. It also only appears once there is something in it. */}
      {(captured.length > 0 || (advantage ?? 0) > 0) && (
        <CapturedPieces
          pieces={captured}
          color={color === "w" ? "b" : "w"}
          advantage={advantage}
          className="min-w-0 shrink"
        />
      )}
      <span className="flex-1" aria-hidden />
      {thinking && (
        <span className="flex shrink-0 items-center gap-1.5 text-2xs font-medium text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Thinking
        </span>
      )}
      {trailing}
    </div>
  );
}
