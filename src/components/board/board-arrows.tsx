import { squareCenter } from "@/lib/chess/fen";
import type { Square } from "@/lib/chess/types";

export type BoardArrow = {
  from: Square;
  to: Square;
  /** `best`/`played` review a move already made; `hint` points at one that has not
   *  been, and is toned differently so the two never read as the same claim. */
  kind: "best" | "played" | "hint";
};

/** Arrows are drawn on a 0–100 overlay so they scale with the board and stay
 *  crisp at any size. Knight moves get an L-bend, the way an annotator draws
 *  them by hand, rather than cutting diagonally across two squares. */
export function BoardArrows({
  arrows,
  flipped,
}: {
  arrows: BoardArrow[];
  flipped: boolean;
}) {
  if (arrows.length === 0) return null;
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        {(["best", "played", "hint"] as const).map((kind) => (
          <marker
            key={kind}
            id={`ah-${kind}`}
            viewBox="0 0 10 10"
            refX="6.4"
            refY="5"
            markerWidth="3.4"
            markerHeight="3.4"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 1 L 8.6 5 L 0 9 L 2.2 5 Z"
              fill={`var(--arrow-${kind})`}
            />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const s = squareCenter(a.from, flipped);
        const e = squareCenter(a.to, flipped);
        const dx = Math.abs(e.x - s.x);
        const dy = Math.abs(e.y - s.y);
        const isKnight =
          (dx === 12.5 && dy === 25) || (dx === 25 && dy === 12.5);
        const d = isKnight
          ? dx === 12.5
            ? `M ${s.x} ${s.y} L ${s.x} ${e.y} L ${e.x} ${e.y}`
            : `M ${s.x} ${s.y} L ${e.x} ${s.y} L ${e.x} ${e.y}`
          : `M ${s.x} ${s.y} L ${e.x} ${e.y}`;
        return (
          <path
            key={`${a.from}${a.to}${i}`}
            d={d}
            fill="none"
            stroke={`var(--arrow-${a.kind})`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#ah-${a.kind})`}
          />
        );
      })}
    </svg>
  );
}
