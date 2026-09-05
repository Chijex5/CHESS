"use client";

import { cn } from "@/lib/utils";
import { PieceGlyph } from "./piece-glyph";
import type { PieceColor, PieceType } from "@/lib/chess/types";

const CHOICES: { type: PieceType; label: string }[] = [
  { type: "q", label: "Queen" },
  { type: "r", label: "Rook" },
  { type: "b", label: "Bishop" },
  { type: "n", label: "Knight" },
];

/* Anchored over the promotion square rather than shown as a modal: on a real
   board you put the new piece down where the pawn arrived, and a centred dialog
   hides the position you are promoting into. */
export function PromotionPicker({
  color,
  /** 0–7 column of the promotion square as drawn. */
  file,
  /** true when the square is on the bottom edge, so the list opens upward. */
  fromBottom = false,
  onPick,
  onCancel,
}: {
  color: PieceColor;
  file: number;
  fromBottom?: boolean;
  onPick: (type: PieceType) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Cancel promotion"
        onClick={onCancel}
        className="absolute inset-0 z-30 bg-background/55 backdrop-blur-[1px]"
      />
      <div
        role="group"
        aria-label="Choose promotion piece"
        className={cn(
          "absolute z-40 flex flex-col overflow-hidden rounded-md border border-board-edge bg-board-light shadow-xl",
          fromBottom ? "bottom-0" : "top-0",
        )}
        style={{ left: `${file * 12.5}%`, width: "12.5%" }}
      >
        {(fromBottom ? [...CHOICES].reverse() : CHOICES).map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => onPick(type)}
            aria-label={label}
            className="relative aspect-square transition-colors hover:bg-hl-selected focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <PieceGlyph
              type={type}
              color={color}
              className="piece-lift absolute inset-x-0 bottom-[-1%] w-full"
            />
          </button>
        ))}
      </div>
    </>
  );
}
