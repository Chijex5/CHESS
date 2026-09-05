"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
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
  /** Legal destinations from every square that has one. Keys double as the set of
   *  pieces that can be picked up, so dragging and the target dots read from one
   *  source instead of two that can disagree. */
  legalMoves?: Record<string, Square[]>;
  checkSquare?: Square | null;
  /** Ringed but not arrowed: the first stage of a hint names the piece and leaves
   *  the move to be found. */
  hintSquare?: Square | null;
  arrows?: BoardArrow[];
  coordinates?: boolean;
  interactive?: boolean;
  onSquareClick?: (square: Square) => void;
  /** Completed drag. Falls back to two `onSquareClick`s when absent, so a caller
   *  that only speaks click still gets drag for free. */
  onMove?: (from: Square, to: Square) => void;
  /** Spoken to screen readers when the position changes. */
  announcement?: string;
  children?: React.ReactNode;
  className?: string;
};

/** Pointer travel, in px, before a press becomes a drag rather than a click. Low
 *  enough that a deliberate drag is never mistaken for a tap, high enough that a
 *  shaky finger on a phone still counts as a tap. */
const DRAG_THRESHOLD = 5;

type Drag = {
  from: Square;
  /** Pointer position in board-local px. */
  x: number;
  y: number;
  /** Square currently under the pointer, whether or not it is legal. */
  over: Square | null;
};

/* Memoised on purpose. Coach tokens arrive ~30×/second; if the board shares a
   render path with the stream, every token repaints 64 squares and 32 pieces. */
export const ChessBoard = memo(function ChessBoard({
  fen,
  flipped = false,
  lastMove = null,
  selected = null,
  legalMoves,
  checkSquare = null,
  hintSquare = null,
  arrows = [],
  coordinates = true,
  interactive = false,
  onSquareClick,
  onMove,
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

  const [drag, setDrag] = useState<Drag | null>(null);
  /* A drag ends with a `click` on the origin square, which would re-select the
     piece we just moved. One flag, cleared by the click it suppresses. */
  const swallowClick = useRef(false);
  const pressed = useRef<{ from: Square; clientX: number; clientY: number } | null>(null);

  /* While a piece is in the air its own targets are the ones worth showing, even
     if the selection has not caught up. Otherwise it is the selected square's. */
  const targets = useMemo(() => {
    const origin = drag?.from ?? selected;
    return new Set(origin ? (legalMoves?.[origin] ?? []) : []);
  }, [drag?.from, selected, legalMoves]);

  const lastFromIdx = lastMove ? squareToIndex(lastMove.from, flipped) : -1;
  const lastToIdx = lastMove ? squareToIndex(lastMove.to, flipped) : -1;
  const selectedIdx = selected ? squareToIndex(selected, flipped) : -1;
  const checkIdx = checkSquare ? squareToIndex(checkSquare, flipped) : -1;
  const hintIdx = hintSquare ? squareToIndex(hintSquare, flipped) : -1;
  const dragFromIdx = drag ? squareToIndex(drag.from, flipped) : -1;

  // One roving tabstop rather than 64: arrow keys walk the grid, the way a
  // player's eye does. 64 sequential tabstops make a board unusable by keyboard.
  const [cursor, setCursor] = useState(60);
  const gridRef = useRef<HTMLDivElement>(null);

  /** Board-local pointer position, plus the square it is over. */
  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const side = rect.width / 8;
      const file = Math.floor(x / side);
      const rank = Math.floor(y / side);
      const inside = file >= 0 && file < 8 && rank >= 0 && rank < 8;
      return {
        x,
        y,
        over: inside ? indexToSquare(rank * 8 + file, flipped) : null,
      };
    },
    [flipped],
  );

  const canPickUp = (square: Square) =>
    interactive && (legalMoves?.[square]?.length ?? 0) > 0;

  const onPointerDown = (event: React.PointerEvent, square: Square) => {
    // Primary button only; a right-click is for arrows, not for moving.
    if (event.button !== 0 || !canPickUp(square)) return;
    pressed.current = { from: square, clientX: event.clientX, clientY: event.clientY };
    /* Capture on the square that was pressed, so the pointer stream keeps coming
       even once the finger leaves it — which it does immediately, by definition.
       Throws if the pointer is no longer active; the drag still works without it,
       it just ends when the pointer leaves the square. */
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Not capturable — carry on uncaptured.
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const press = pressed.current;
    if (!press) return;
    const spot = locate(event.clientX, event.clientY);
    if (!spot) return;

    if (!drag) {
      const travelled = Math.hypot(
        event.clientX - press.clientX,
        event.clientY - press.clientY,
      );
      if (travelled < DRAG_THRESHOLD) return;
      // Picking the piece up also selects it, so releasing outside the board
      // leaves the player exactly where a click would have: piece chosen.
      onSquareClick?.(press.from);
    }
    setDrag({ from: press.from, x: spot.x, y: spot.y, over: spot.over });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const press = pressed.current;
    pressed.current = null;
    if (!press || !drag) {
      setDrag(null);
      return;
    }
    const spot = locate(event.clientX, event.clientY);
    const to = spot?.over ?? null;
    setDrag(null);
    swallowClick.current = true;

    if (to && to !== press.from && (legalMoves?.[press.from] ?? []).includes(to)) {
      if (onMove) onMove(press.from, to);
      else onSquareClick?.(to);
    }
  };

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
    // The board owns the arrow keys while it has focus; the page-level shortcuts
    // that step through the game must not also fire.
    event.preventDefault();
    event.stopPropagation();
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
            const isTarget = targets.has(square);
            const isCheck = idx === checkIdx;
            const isHint = idx === hintIdx;
            const isDragOrigin = idx === dragFromIdx;
            const isDragOver = drag?.over === square && isTarget;
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
                {/* The square the piece would land on, ringed while it is in the
                    air. Without it a drag over a legal square looks identical to a
                    drag over an illegal one until you let go. */}
                {isDragOver && (
                  <span
                    className="absolute inset-0 ring-[4px] ring-inset ring-primary/70"
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
                      // A ghost where the piece came from, the way a real hand
                      // leaves the square empty but remembered.
                      isDragOrigin && "opacity-25",
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

            const pickable = canPickUp(square);

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
                onPointerDown={(e) => onPointerDown(e, square)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  pressed.current = null;
                  setDrag(null);
                }}
                onClick={() => {
                  if (swallowClick.current) {
                    swallowClick.current = false;
                    return;
                  }
                  onSquareClick?.(square);
                }}
                className={cn(
                  squareClass,
                  /* `touch-action: none` only where a piece can be lifted. On the
                     rest of the board a touch still scrolls the page, so a phone
                     user is not trapped by the largest element on the screen. */
                  pickable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer",
                  "focus-visible:z-30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                )}
              >
                {content}
              </button>
            );
          })}
        </div>
        <BoardArrows arrows={arrows} flipped={flipped} />

        {/* The piece in flight. One node, outside the grid, following the pointer —
            cheaper and smoother than re-parenting a glyph between squares. */}
        {drag && (
          <div
            className="pointer-events-none absolute z-40"
            style={{
              width: "12.5%",
              height: "12.5%",
              left: drag.x,
              top: drag.y,
              transform: "translate(-50%, -50%)",
            }}
            aria-hidden
          >
            {(() => {
              const piece = cells[squareToIndex(drag.from, flipped)];
              if (!piece) return null;
              return (
                <PieceGlyph
                  type={piece.type}
                  color={piece.color}
                  className="piece-lift-raised absolute inset-x-0 bottom-0 w-full scale-105"
                />
              );
            })()}
          </div>
        )}

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
