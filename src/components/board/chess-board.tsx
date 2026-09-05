"use client";

import { memo, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FILES,
  indexToSquare,
  isLightSquare,
  parseFen,
  squareToIndex,
} from "@/lib/chess/fen";
import type { Square } from "@/lib/chess/types";
import { PieceGlyph } from "./piece-glyph";
import { BoardArrows, type BoardArrow } from "./board-arrows";

export type ChessBoardProps = {
  fen: string;
  flipped?: boolean;
  lastMove?: { from: Square; to: Square } | null;
  selected?: Square | null;
  legalTargets?: Square[];
  checkSquare?: Square | null;
  /** Ringed but not arrowed: the first stage of a hint names the piece and leaves
   *  the move to be found. */
  hintSquare?: Square | null;
  arrows?: BoardArrow[];
  coordinates?: boolean;
  interactive?: boolean;
  onSquareClick?: (square: Square) => void;
  /** Spoken to screen readers when the position changes. */
  announcement?: string;
  children?: React.ReactNode;
  className?: string;
};

/* Memoised on purpose. Coach tokens arrive ~30×/second; if the board shares a
   render path with the stream, every token repaints 64 squares and 32 pieces. */
export const ChessBoard = memo(function ChessBoard({
  fen,
  flipped = false,
  lastMove = null,
  selected = null,
  legalTargets = [],
  checkSquare = null,
  hintSquare = null,
  arrows = [],
  coordinates = true,
  interactive = false,
  onSquareClick,
  announcement,
  children,
  className,
}: ChessBoardProps) {
  /* `parseFen` always returns absolute order — index 0 is a8, whatever the
     player is looking at. Every other lookup in this component works in *display*
     order via `indexToSquare(idx, flipped)`, so a flipped board must reverse the
     pieces to match, or slot 0 draws a8 while being labelled, highlighted and
     clicked as h1: the position renders 180° out from its own coordinates. */
  const cells = useMemo(() => {
    const absolute = parseFen(fen).cells;
    return flipped ? absolute.slice().reverse() : absolute;
  }, [fen, flipped]);
  const legal = useMemo(() => new Set(legalTargets), [legalTargets]);
  const lastFromIdx = lastMove ? squareToIndex(lastMove.from, flipped) : -1;
  const lastToIdx = lastMove ? squareToIndex(lastMove.to, flipped) : -1;
  const selectedIdx = selected ? squareToIndex(selected, flipped) : -1;
  const checkIdx = checkSquare ? squareToIndex(checkSquare, flipped) : -1;
  const hintIdx = hintSquare ? squareToIndex(hintSquare, flipped) : -1;

  // One roving tabstop rather than 64: arrow keys walk the grid, the way a
  // player's eye does. 64 sequential tabstops make a board unusable by keyboard.
  const [cursor, setCursor] = useState(60);
  const gridRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent, idx: number) => {
    const delta =
      event.key === "ArrowRight" && idx % 8 !== 7
        ? 1
        : event.key === "ArrowLeft" && idx % 8 !== 0
          ? -1
          : event.key === "ArrowDown" && idx < 56
            ? 8
            : event.key === "ArrowUp" && idx > 7
              ? -8
              : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = idx + delta;
    setCursor(next);
    gridRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus();
  };

  const rankLabels = flipped ? FILES.map((_, i) => `${i + 1}`) : FILES.map((_, i) => `${8 - i}`);
  const fileLabels = flipped ? [...FILES].reverse() : FILES;

  return (
    <div
      className={cn(
        // The frame is the board's furniture: turned edge, felt-dark rim, and
        // the coordinates engraved on it rather than printed in the squares.
        "board-frame-relief relative w-full select-none rounded-lg bg-board-frame p-[3.4%] [container-type:inline-size]",
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-[3px] ring-1 ring-board-edge/70">
        <div ref={gridRef} className="grid h-full w-full grid-cols-8 grid-rows-8">
          {cells.map((piece, idx) => {
            const square = indexToSquare(idx, flipped);
            const light = isLightSquare(idx, flipped);
            const isLast = idx === lastFromIdx || idx === lastToIdx;
            const isSelected = idx === selectedIdx;
            const isTarget = legal.has(square);
            const isCheck = idx === checkIdx;
            const isHint = idx === hintIdx;
            const content = (
              <>
                {isLast && (
                  <span className="absolute inset-0 bg-hl-lastmove" aria-hidden />
                )}
                {isSelected && (
                  <span
                    className="absolute inset-0 bg-hl-selected ring-2 ring-inset ring-primary/70"
                    aria-hidden
                  />
                )}
                {isCheck && (
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 50%, var(--hl-check) 0%, transparent 72%)",
                    }}
                    aria-hidden
                  />
                )}
                {isHint && (
                  <span
                    className="absolute inset-[6%] animate-pulse rounded-md ring-[3px] ring-inset ring-arrow-hint"
                    aria-hidden
                  />
                )}
                {isTarget && !piece && (
                  <span
                    className="absolute h-[26%] w-[26%] rounded-full bg-hl-legal"
                    aria-hidden
                  />
                )}
                {isTarget && piece && (
                  <span
                    className="absolute inset-[6%] rounded-full border-[6%] border-hl-legal"
                    aria-hidden
                  />
                )}
                {piece && (
                  <PieceGlyph
                    type={piece.type}
                    color={piece.color}
                    className={cn(
                      // Anchored, not centred: the base sits on the square.
                      "piece-lift absolute inset-x-0 bottom-[-1%] z-10 w-full",
                      "duration-150 animate-in fade-in zoom-in-95",
                    )}
                  />
                )}
              </>
            );

            const squareClass = cn(
              "board-grain relative flex items-center justify-center",
              light ? "bg-board-light" : "bg-board-dark",
            );

            /* Static boards render plain cells. 64 disabled buttons per board is
               invalid inside a clickable card and floods the accessibility tree
               for every thumbnail. */
            if (!interactive) {
              return (
                <div key={square} className={squareClass} aria-hidden>
                  {content}
                </div>
              );
            }

            return (
              <button
                key={square}
                type="button"
                tabIndex={idx === cursor ? 0 : -1}
                onFocus={() => setCursor(idx)}
                onKeyDown={(e) => onKeyDown(e, idx)}
                aria-label={
                  piece
                    ? `${square}, ${piece.color === "w" ? "white" : "black"} ${piece.type}`
                    : square
                }
                onClick={() => onSquareClick?.(square)}
                className={cn(
                  squareClass,
                  "cursor-pointer",
                  "focus-visible:z-30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                )}
              >
                {content}
              </button>
            );
          })}
        </div>
        <BoardArrows arrows={arrows} flipped={flipped} />
        {children}
      </div>

      {announcement !== undefined && (
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      )}

      {coordinates && (
        <>
          <div
            className="pointer-events-none absolute inset-y-[3.4%] left-0 flex w-[3.4%] flex-col justify-around"
            aria-hidden
          >
            {rankLabels.map((r) => (
              <span
                key={r}
                className="tnum text-center text-[clamp(7px,0.85cqw,11px)] font-semibold text-board-light/80"
              >
                {r}
              </span>
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-x-[3.4%] bottom-0 flex h-[3.4%] items-center justify-around"
            aria-hidden
          >
            {fileLabels.map((f) => (
              <span
                key={f}
                className="text-center text-[clamp(7px,0.85cqw,11px)] font-semibold uppercase text-board-light/80"
              >
                {f}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
