import { Chess } from "chess.js";
import { CONCEPTS, publicConcept } from "./concepts";
import type { Concept } from "@/lib/chess/types";

export type MoveContext = {
  fenBefore: string;
  /** Absent when nothing has been played yet — a hint asks about `bestSan` alone. */
  playedSan?: string;
  bestSan: string;
  quality: string;
};

/* Feature extraction, not guesswork. Everything below is read off the board
   with chess.js; nothing is inferred from the eval or asked of the model. */
export function positionFeatures(context: MoveContext): string[] {
  const tags = new Set<string>([context.quality]);
  const board = new Chess(context.fenBefore);

  const moveNumber = Number(context.fenBefore.split(" ")[5]) || 1;
  const material = board
    .board()
    .flat()
    .filter((cell) => cell && cell.type !== "k" && cell.type !== "p").length;
  tags.add(moveNumber <= 12 ? "opening" : material <= 6 ? "endgame" : "middlegame");

  /* A hint has no played move, so the move under discussion *is* the engine's.
     Everything below then describes the recommendation rather than the mistake,
     which is exactly what we want its principles retrieved for. */
  const subject = context.playedSan ?? context.bestSan;
  const played = safeMove(board, subject);
  if (!played) return [...tags];

  tags.add(`piece:${played.piece}`);
  if (played.captured) tags.add("capture");
  if (played.san.includes("+") || played.san.includes("#")) tags.add("check");
  if (played.san.startsWith("O-O")) tags.add("castling");
  if (played.promotion) tags.add("promotion");
  if (!played.captured && !played.san.includes("+")) tags.add("quiet");
  if (["d4", "d5", "e4", "e5"].includes(played.to)) tags.add("center");

  // Did the move leave the piece it moved hanging?
  const opponent = played.color === "w" ? "b" : "w";
  if (board.isAttacked(played.to, opponent)) {
    tags.add("left-attacked");
    if (board.attackers(played.to, played.color).length === 0) tags.add("undefended");
  }

  // Files with no pawns are what rooks are for.
  if (played.piece === "r") {
    const file = played.to[0];
    const pawns = board
      .board()
      .flat()
      .filter((cell) => cell && cell.type === "p" && cell.square[0] === file);
    if (pawns.length === 0) tags.add("open-file");
    else if (pawns.length === 1) tags.add("half-open-file");
    if (played.to[1] === "1" || played.to[1] === "8") tags.add("back-rank");
  }

  // Comparing played against preferred only means something when they can differ.
  if (!context.playedSan) return [...tags];

  // The engine's preference is itself a signal: a missed check or capture is a
  // missed threat, and a quiet recommendation is usually positional.
  const alt = new Chess(context.fenBefore);
  const best = safeMove(alt, context.bestSan);
  if (best) {
    tags.add(`best:${best.piece}`);
    if (best.captured) tags.add("missed-threat");
    if (best.san.includes("+")) tags.add("missed-threat");
    if (!best.captured && !best.san.includes("+")) tags.add("positional-fix");
    if (played.captured && best.captured) tags.add("recapture");
  }

  const lostMaterial = played.captured
    ? false
    : board.isAttacked(played.to, opponent) &&
      board.attackers(played.to, played.color).length === 0;
  if (lostMaterial) tags.add("material-loss");

  return [...tags];
}

function safeMove(board: Chess, san: string) {
  try {
    return board.move(san);
  } catch {
    return null;
  }
}

/**
 * Ranks the corpus against the position's features. Runs in-process inside the
 * route handler — there is no retrieval service to deploy or keep alive.
 *
 * Tag overlap rather than embeddings, and at this corpus size that is the better
 * retriever, not a placeholder: the features above are exact, discrete facts read
 * off the board, so matching them against hand-authored tags is precise and
 * explainable. Cosine similarity over fourteen short blurbs would be fuzzier and
 * slower for no gain. Embeddings start to earn their cost once the corpus is
 * hundreds of annotated positions rather than a page of principles.
 */
export function retrieveConcepts(context: MoveContext, limit = 3): Concept[] {
  const features = positionFeatures(context);
  const set = new Set(features);
  return CONCEPTS.map((concept) => ({
    concept,
    score: concept.tags.reduce((total, tag) => total + (set.has(tag) ? 1 : 0), 0),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => publicConcept(row.concept));
}
