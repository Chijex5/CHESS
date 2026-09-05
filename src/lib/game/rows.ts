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
