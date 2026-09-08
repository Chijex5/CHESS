import { cn } from "@/lib/utils";
import { PieceGlyph } from "@/components/board/piece-glyph";
import type { PieceColor, PieceType } from "@/lib/chess/types";

/* A complete capture tray can hold fifteen pieces. Six overlapping glyphs retain
   the familiar material-at-a-glance cue without competing with a player's name,
   rating, and clock for the one-row layout. */
const MAX_VISIBLE_PIECES = 6;

/** The pieces this side has taken, plus the running material count — the
 *  physical equivalent of the little pile beside a real board. */
export function CapturedPieces({
  pieces,
  color,
  advantage,
  className,
}: {
  /** Captured pieces, which belong to the *opposing* colour. */
  pieces: PieceType[];
  /** Colour of the captured material. */
  color: PieceColor;
  /** Material delta from this tray owner's point of view; only shown if > 0. */
  advantage?: number;
  className?: string;
}) {
  const visiblePieces = pieces.slice(0, MAX_VISIBLE_PIECES);
  const hiddenCount = pieces.length - visiblePieces.length;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      aria-label={`${pieces.length} captured ${pieces.length === 1 ? "piece" : "pieces"}`}
    >
      <div className="flex shrink-0 items-center">
        {visiblePieces.map((t, i) => (
          <PieceGlyph
            key={`${t}${i}`}
            type={t}
            color={color}
            className="-ml-1.5 h-5 w-5 first:ml-0 opacity-85"
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <span
          className="tnum shrink-0 font-mono text-2xs font-medium text-muted-foreground"
          title={`${hiddenCount} additional captured ${hiddenCount === 1 ? "piece" : "pieces"}`}
        >
          +{hiddenCount}
        </span>
      )}
      {advantage !== undefined && advantage > 0 && (
        <span className="tnum shrink-0 font-mono text-2xs font-medium text-muted-foreground">
          +{advantage}
        </span>
      )}
    </div>
  );
}
