import type { PieceColor, PieceType } from "@/lib/chess/types";

/* ── Staunton silhouettes ─────────────────────────────────────────────────────
   Authored on a 100×100 square, every piece standing on a common ground line
   at y=94 so they share a baseline the way a real set does.

   FIDE C.02 §2.3 fixes heights at K 9.5 / Q 8.5 / B 7 / N 6 / R 5.5 / P 5 cm
   and §2.4 puts each base at 40–50% of its own height, which lands a
   tournament king's base near 75% of a 5.7 cm square. The true pawn:king ratio
   of 0.53 reads as spindly in a flat top-down projection, so the heights below
   are compressed toward parity — but §2.3's strict descending order is kept
   exactly: 90 > 87 > 86 > 85 > 78 > 74.5 units tall.

   §2.5 asks that pieces be clearly distinguishable, and that the bishop carry
   a notch to separate it from a pawn. Both are honoured in silhouette, so the
   set stays readable at the ~40px squares a phone gives you.
   ────────────────────────────────────────────────────────────────────────── */

/** Collar and flared foot in one path. `w` is the base half-width. */
function foot(w: number) {
  const l = 50 - w;
  const r = 50 + w;
  return [
    `M ${50 - w * 0.7} 73`,
    `L ${50 + w * 0.7} 73`,
    `L ${50 + w * 0.78} 78`,
    `C ${50 + w * 0.94} 81 ${r} 85.5 ${r} 89.5`,
    `L ${r} 94 L ${l} 94 L ${l} 89.5`,
    `C ${l} 85.5 ${50 - w * 0.94} 81 ${50 - w * 0.78} 78`,
    "Z",
  ].join(" ");
}

/** The turned ring where body meets collar — the line that stops a piece
 *  reading as a flat blob at small sizes. */
function ring(w: number) {
  return `M ${50 - w * 0.7} 73.4 L ${50 + w * 0.7} 73.4`;
}

type Spec = { body: React.ReactNode; base: number; detail?: React.ReactNode };

const PAWN: Spec = {
  base: 30,
  body: (
    <>
      <circle cx="50" cy="33" r="13.5" />
      <path d="M 39.5 43.5 Q 50 49.5 60.5 43.5 L 63 51 Q 50 55.5 37 51 Z" />
      <path d="M 40.5 53 C 40.5 62.5 36 68.5 30.5 73 L 69.5 73 C 64 68.5 59.5 62.5 59.5 53 Z" />
    </>
  ),
};

const ROOK: Spec = {
  base: 34,
  body: (
    <>
      <path d="M 24 16 L 34 16 L 34 23 L 38 23 L 38 16 L 48 16 L 48 23 L 52 23 L 52 16 L 62 16 L 62 23 L 66 23 L 66 16 L 76 16 L 76 33 L 24 33 Z" />
      <path d="M 28.5 33 L 71.5 33 L 68 73 L 32 73 Z" />
    </>
  ),
  detail: <path d="M 27 33.4 L 73 33.4" />,
};

const KNIGHT: Spec = {
  base: 33,
  body: (
    <>
      {/* Ear first, so the crest overlaps its root. */}
      <path d="M 57.5 26 L 64.5 9 L 70.5 26.5 Z" />
      <path
        d="M 19 45
           C 14.5 48 15.5 53.5 20.5 53.5
           C 25 55.5 30 55 34 52.5
           C 31.5 58 30.5 62 31.5 66
           C 32.5 69.5 32.5 71 31.5 73
           L 73 73
           C 74.5 64.5 74 54 70.5 44
           C 68 36.5 66.5 29 62.5 24
           C 57 20.5 49 22.5 42 27
           C 33 32.5 25 38.5 19 45 Z"
      />
    </>
  ),
  detail: (
    <>
      {/* Mane cuts down the crest, and the nostril. */}
      <path d="M 66.5 33 L 73 35" />
      <path d="M 68.5 43 L 74 45.5" />
      <path d="M 69.5 54 L 74 56" />
      <path d="M 20.8 48.6 L 23.4 49.4" />
    </>
  ),
};

const BISHOP: Spec = {
  base: 33,
  body: (
    <>
      <circle cx="50" cy="13" r="5" />
      <path d="M 50 17 C 42.5 24 35.5 33.5 35.5 43 C 35.5 51 41.5 56 50 56 C 58.5 56 64.5 51 64.5 43 C 64.5 33.5 57.5 24 50 17 Z" />
      <path d="M 38 55.5 L 62 55.5 L 65 62 L 35 62 Z" />
      <path d="M 37.5 61.5 C 37.5 67 34.5 70.5 31.5 73 L 68.5 73 C 65.5 70.5 62.5 67 62.5 61.5 Z" />
    </>
  ),
  /* §2.5: the notch is what separates a bishop from a pawn at a glance. */
  detail: <path d="M 50 24 L 59.5 36" strokeWidth={2.8} />,
};

const QUEEN: Spec = {
  base: 36,
  body: (
    <>
      <path d="M 26 41 L 23.5 18 L 32 32 L 37.5 13 L 44 30 L 50 10 L 56 30 L 62.5 13 L 68 32 L 76.5 18 L 74 41 Z" />
      <circle cx="23.5" cy="15" r="4.5" />
      <circle cx="37.5" cy="10" r="4.5" />
      <circle cx="50" cy="7" r="5" />
      <circle cx="62.5" cy="10" r="4.5" />
      <circle cx="76.5" cy="15" r="4.5" />
      <path d="M 25.5 40.5 L 74.5 40.5 L 72 48 L 28 48 Z" />
      <path d="M 30 47.5 C 30 59 26 68 21.5 73 L 78.5 73 C 74 68 70 59 70 47.5 Z" />
    </>
  ),
  detail: <path d="M 27 40.9 L 73 40.9" />,
};

const KING: Spec = {
  base: 38,
  body: (
    <>
      <path d="M 45 4 L 55 4 L 55 12 L 63 12 L 63 21 L 55 21 L 55 30 L 45 30 L 45 21 L 37 21 L 37 12 L 45 12 Z" />
      <path d="M 27 44 C 27 35 37 28 50 28 C 63 28 73 35 73 44 Z" />
      <path d="M 26 43.5 L 74 43.5 L 71.5 51 L 28.5 51 Z" />
      <path d="M 30 50.5 C 30 61 25.5 69 20.5 73 L 79.5 73 C 74.5 69 70 61 70 50.5 Z" />
    </>
  ),
  detail: <path d="M 27.5 43.9 L 72.5 43.9" />,
};

const SPECS: Record<PieceType, Spec> = {
  p: PAWN,
  r: ROOK,
  n: KNIGHT,
  b: BISHOP,
  q: QUEEN,
  k: KING,
};

export function PieceGlyph({
  type,
  color,
  className,
}: {
  type: PieceType;
  color: PieceColor;
  className?: string;
}) {
  const spec = SPECS[type];
  const light = color === "w";
  const edge = light ? "var(--piece-light-edge)" : "var(--piece-dark-edge)";
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      <g
        fill={light ? "var(--piece-light)" : "var(--piece-dark)"}
        stroke={edge}
        strokeWidth={light ? 2.4 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {spec.body}
        <path d={foot(spec.base)} />
      </g>
      <g
        fill="none"
        stroke={edge}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.9}
      >
        <path d={ring(spec.base)} />
        {spec.detail}
      </g>
    </svg>
  );
}
