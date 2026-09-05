import { Chess } from "chess.js";

/** UCI coordinate move ("e2e4", "e7e8q") → its parts. */
export function splitUci(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
  };
}

export function uciOf(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/* LLMs read SAN far better than FEN or coordinate notation: "1...Nxe5 2.Bb5+"
   grounds where "e6e5 f1b5" does not. Every line handed to the coach goes
   through here first. */
export function uciLineToSan(fen: string, uciMoves: string[], limit = 8): string[] {
  const board = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves.slice(0, limit)) {
    try {
      san.push(board.move(splitUci(uci)).san);
    } catch {
      break;
    }
  }
  return san;
}

export function uciToSan(fen: string, uci: string): string | null {
  return uciLineToSan(fen, [uci], 1)[0] ?? null;
}

/** The squares a SAN move travels between, for drawing it as an arrow. Returns
 *  null when the move is not legal in that position, which the concept-example
 *  check script exists to prevent. */
export function sanToSquares(
  fen: string,
  san: string,
): { from: string; to: string } | null {
  const move = new Chess(fen).moves({ verbose: true }).find((m) => m.san === san);
  return move ? { from: move.from, to: move.to } : null;
}

/** Standard PGN with the coach's notes as move comments. */
export function toPgn(
  moves: { san: string }[],
  headers: Record<string, string>,
  comments: Record<number, string> = {},
) {
  const lines = Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`);
  const body: string[] = [];
  moves.forEach((move, index) => {
    if (index % 2 === 0) body.push(`${index / 2 + 1}.`);
    body.push(move.san);
    const comment = comments[index + 1];
    if (comment) body.push(`{${comment.replace(/[{}]/g, "")}}`);
  });
  return `${lines.join("\n")}\n\n${body.join(" ")}\n`;
}
