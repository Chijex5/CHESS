export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PieceColor = "w" | "b";
export type Piece = { type: PieceType; color: PieceColor };

export type Square = string; // "a1" … "h8"
export type Side = "white" | "black";

/** Standard chess annotation glyphs, which double as our severity scale.
 *  Colour never carries this meaning alone. */
export type MoveQuality =
  | "brilliant"  // !!
  | "best"       // !
  | "good"       //
  | "inaccuracy" // ?!
  | "mistake"    // ?
  | "blunder";   // ??

export const QUALITY_GLYPH: Record<MoveQuality, string> = {
  brilliant: "!!",
  best: "!",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

export const QUALITY_LABEL: Record<MoveQuality, string> = {
  brilliant: "Brilliant",
  best: "Best move",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

/** Engine evaluation, always normalised to White's perspective.
 *
 *  `mated` exists because "mate in 0" has no sign. UCI reports a checkmated
 *  position as `mate 0` from the side to move, and normalising that by negation
 *  leaves zero — which read as a win for Black however White got there, and
 *  scored every delivered checkmate as a 100% blunder. Naming the winner instead
 *  makes the case unrepresentable-wrong. */
export type Evaluation =
  | { kind: "cp"; cp: number }
  /** Signed distance to mate: positive for White. Never 0 — see `mated`. */
  | { kind: "mate"; movesToMate: number }
  | { kind: "mated"; winner: Side };

export type AnnotationStage =
  | "queued"
  | "analyzing"
  | "retrieving"
  | "streaming"
  | "complete"
  | "error";

/** A position that shows the principle, used as the worked example on the concept
 *  page. Every one is verified legal and the move verified playable by
 *  `scripts/check-concepts.mjs`. */
export type ConceptExample = {
  fen: string;
  /** The move that demonstrates the idea, in SAN. */
  san: string;
  /** One line on what the move does here. */
  caption: string;
};

export type Concept = {
  slug: string;
  name: string;
  family: "tactical" | "positional" | "endgame" | "opening";
  /** The definition, in one sentence. */
  blurb: string;
  /** The board pattern that should make you stop — what to physically look for. */
  look?: string;
  /** When the idea applies, and when it does not. This is the half a blurb leaves
   *  out, and the half a drill needs to be worth anything. */
  when?: string;
  /** The way the idea is usually got wrong. */
  pitfall?: string;
  example?: ConceptExample;
};

export type Annotation = {
  ply: number;
  moveNumber: number;
  side: Side;
  /** Facts from the engine — available synchronously, rendered immediately. */
  playedSan: string;
  bestSan: string;
  evalBefore: Evaluation;
  evalAfter: Evaluation;
  winPctBefore: number;
  winPctAfter: number;
  quality: MoveQuality;
  pvSan: string[];
  fenBefore: string;
  /** Streamed from the coach — arrives late, never blocks the board. */
  stage: AnnotationStage;
  prose: string;
  concepts: Concept[];
};

/** One half-move, with the positions either side of it. */
export type PlyRecord = {
  ply: number;
  moveNumber: number;
  side: Side;
  san: string;
  from: Square;
  to: Square;
  captured: PieceType | null;
  fenBefore: string;
  fenAfter: string;
};

export type GameStatus = "idle" | "playing" | "thinking" | "over";

export type GameResult = {
  outcome: string;
  detail: string;
  playerWon: boolean | null;
  /** Set for a reviewed multiplayer game so the review never invents an engine opponent. */
  playerName?: string;
  opponentName?: string;
};
