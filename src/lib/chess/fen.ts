import type { Piece, PieceColor, PieceType, Square } from "./types";

export const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/** Board as 64 cells in display order: index 0 = a8, index 63 = h1. */
export type BoardCells = (Piece | null)[];

export function parseFen(fen: string): {
  cells: BoardCells;
  turn: PieceColor;
  fullmove: number;
} {
  const [placement, turn = "w", , , , fullmove = "1"] = fen.split(" ");
  const cells: BoardCells = [];
  for (const row of placement.split("/")) {
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push(null);
      } else {
        cells.push({
          type: ch.toLowerCase() as PieceType,
          color: ch === ch.toUpperCase() ? "w" : "b",
        });
      }
    }
  }
  return {
    cells,
    turn: turn === "b" ? "b" : "w",
    fullmove: Number(fullmove) || 1,
  };
}

/** Display index (0 = top-left as drawn) → algebraic square, honouring flip. */
export function indexToSquare(index: number, flipped: boolean): Square {
  const i = flipped ? 63 - index : index;
  return `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
}

export function squareToIndex(square: Square, flipped: boolean): number {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  const i = (8 - rank) * 8 + file;
  return flipped ? 63 - i : i;
}

/** Percentage centre of a square, for arrow geometry on a 0–100 overlay. */
export function squareCenter(square: Square, flipped: boolean) {
  const i = squareToIndex(square, flipped);
  return { x: (i % 8) * 12.5 + 6.25, y: Math.floor(i / 8) * 12.5 + 6.25 };
}

export function isLightSquare(index: number, flipped: boolean): boolean {
  const i = flipped ? 63 - index : index;
  return (Math.floor(i / 8) + (i % 8)) % 2 === 0;
}

/** Material still on the board, for the captured-pieces trays. */
const START_COUNT: Record<PieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};
const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function capturedFrom(cells: BoardCells) {
  const live: Record<PieceColor, Record<PieceType, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const c of cells) if (c) live[c.color][c.type] += 1;

  const captured = (color: PieceColor) =>
    (Object.keys(START_COUNT) as PieceType[]).flatMap((t) =>
      Array.from(
        { length: Math.max(0, START_COUNT[t] - live[color][t]) },
        () => t,
      ),
    );

  const score = (color: PieceColor) =>
    (Object.keys(START_COUNT) as PieceType[]).reduce(
      (s, t) => s + live[color][t] * VALUE[t],
      0,
    );

  return {
    // A tray shows the pieces its owner has *won*, i.e. the opponent's losses.
    whiteTray: captured("b"),
    blackTray: captured("w"),
    advantage: score("w") - score("b"),
  };
}
