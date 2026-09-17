import type { MoveListRow } from "@/components/game/move-list";
import type { Annotation, PlyRecord } from "@/lib/chess/types";

/** Pairs plies into numbered rows and attaches whatever the coach has judged. */
export function toMoveRows(
  plies: PlyRecord[],
  annotations: Record<number, Annotation>,
  /** Plies the player took a hint on, marked so the list is an honest record. */
  hintedPlies: number[] = [],
): MoveListRow[] {
  const hinted = new Set(hintedPlies);
  const rows: MoveListRow[] = [];
  for (const ply of plies) {
    const entry = {
      ply: ply.ply,
      san: ply.san,
      quality: annotations[ply.ply]?.quality,
      hinted: hinted.has(ply.ply),
    };
    if (ply.side === "white") rows.push({ moveNumber: ply.moveNumber, white: entry });
    else {
      const row = rows.at(-1);
      if (row && row.moveNumber === ply.moveNumber && !row.black) row.black = entry;
      else rows.push({ moveNumber: ply.moveNumber, black: entry });
    }
  }
  return rows;
}

/**
 * The same rows from a bare move list — an online game's, which has no annotations
 * and no hints because no engine was allowed near it.
 *
 * Colour comes from position rather than from replaying the game: the server wrote
 * this log from the starting position, so an even index is always White's move. It
 * was inlined in the board view and is here now because the summary page needs it too.
 */
export function sansToRows(sans: string[]): MoveListRow[] {
  const rows: MoveListRow[] = [];
  sans.forEach((san, index) => {
    const ply = index + 1;
    const entry = { ply, san };
    if (index % 2 === 0) rows.push({ moveNumber: Math.ceil(ply / 2), white: entry });
    else rows[rows.length - 1].black = entry;
  });
  return rows;
}
