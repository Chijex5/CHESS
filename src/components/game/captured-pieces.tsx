import { cn } from "@/lib/utils";
import { PieceGlyph } from "@/components/board/piece-glyph";
import type { PieceColor, PieceType } from "@/lib/chess/types";

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
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex items-center">
        {pieces.map((t, i) => (
          <PieceGlyph
            key={`${t}${i}`}
            type={t}
            color={color}
            className="-ml-1.5 h-5 w-5 first:ml-0 opacity-85"
          />
        ))}
      </div>
      {advantage !== undefined && advantage > 0 && (
        <span className="tnum font-mono text-2xs font-medium text-muted-foreground">
          +{advantage}
        </span>
      )}
    </div>
  );
}
