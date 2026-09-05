"use client";

import { Chess } from "chess.js";
import { ANALYSIS_DEPTH, getAnalyst, getOpponent, setOpponentElo } from "@/lib/engine/manager";
import { COMMIT_DEPTH, useEngine } from "@/lib/store/engine-store";
import { useGame } from "@/lib/store/game-store";
import { useCoach } from "@/lib/store/coach-store";
import {
  SENSITIVITY_THRESHOLD,
  useSettings,
  warnsOnHangingPiece,
} from "@/lib/store/settings-store";
import { useHint } from "@/lib/store/hint-store";
import { classify, evalToWinPct } from "@/lib/chess/eval";
import { splitUci, uciLineToSan, uciOf, uciToSan } from "./notation";
import { requestExplanation, requestHintReason } from "@/lib/coach/client";
import { cueForMove, playCue } from "@/lib/audio/sfx";
import type {
  Evaluation,
  GameResult,
  PieceColor,
  PieceType,
  PlyRecord,
  Square,
} from "@/lib/chess/types";

/* The live game lives here, not in the store: chess.js is mutable, and a
   reactive copy of it would re-render the board on every internal bookkeeping
   change. The store holds the immutable snapshot the UI reads. */
let chess = new Chess();
let coachAborts = new Map<number, AbortController>();
let hintAbort: AbortController | null = null;

/** Rough exchange values, only ever compared against each other. */
const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function legalMap(board: Chess): Record<string, Square[]> {
  const map: Record<string, Square[]> = {};
  for (const move of board.moves({ verbose: true })) {
    (map[move.from] ??= []).push(move.to);
  }
  return map;
}

function checkSquare(board: Chess): Square | null {
  if (!board.inCheck()) return null;
  const turn = board.turn();
  for (const row of board.board()) {
    for (const cell of row) {
      if (cell && cell.type === "k" && cell.color === turn) return cell.square;
    }
  }
  return null;
}

function resultOf(board: Chess, playerColor: PieceColor): GameResult | null {
  if (!board.isGameOver()) return null;
  const moveNumber = Math.ceil(board.history().length / 2);
  if (board.isCheckmate()) {
    const loser = board.turn();
    const playerWon = loser !== playerColor;
    return {
      outcome: `${loser === "w" ? "White" : "Black"} is checkmated`,
      detail: `${loser === "w" ? "Black" : "White"} wins · move ${moveNumber}`,
      playerWon,
    };
  }
  const reason = board.isStalemate()
    ? "Stalemate"
    : board.isInsufficientMaterial()
      ? "Insufficient material"
      : board.isThreefoldRepetition()
        ? "Threefold repetition"
        : "Fifty-move rule";
  return { outcome: "Draw", detail: `${reason} · move ${moveNumber}`, playerWon: null };
}

/** The chord a finished game ends on, from the player's point of view. */
function outcomeCue(result: GameResult) {
  return result.playerWon === null ? "draw" : result.playerWon ? "win" : "loss";
}

function syncPosition() {
  useGame.getState().patch({
    legal: legalMap(chess),
    checkSquare: checkSquare(chess),
  });
}

function announce(record: PlyRecord | null) {
  const game = useGame.getState();
  const text = record
    ? `${record.moveNumber}${record.side === "white" ? "." : "…"} ${record.san}${
        chess.inCheck() ? ", check" : ""
      }. ${chess.turn() === "w" ? "White" : "Black"} to move.`
    : "Starting position, White to move.";
  game.patch({ lastAnnouncement: text });
}

function toRecord(
  move: { san: string; from: string; to: string; captured?: string },
  fenBefore: string,
): PlyRecord {
  const ply = chess.history().length;
  return {
    ply,
    moveNumber: Math.ceil(ply / 2),
    side: ply % 2 === 1 ? "white" : "black",
    san: move.san,
    from: move.from,
    to: move.to,
    captured: (move.captured as PieceType | undefined) ?? null,
    fenBefore,
    fenAfter: chess.fen(),
  };
}

/** One analysis search, stored against the ply it describes. */
/** The exact evaluation of a position with no legal moves, or null if the game is
 *  still on. Checkmate names its winner; every other ending is a draw. */
function terminalEval(fen: string): Evaluation | null {
  const board = new Chess(fen);
  if (!board.isGameOver()) return null;
  if (board.isCheckmate()) {
    return { kind: "mated", winner: board.turn() === "w" ? "black" : "white" };
  }
  return { kind: "cp", cp: 0 };
}

async function analyse(ply: number, fen: string) {
  const engine = useEngine.getState();

  /* A finished position has no move to search and no score to find — the result
     *is* the evaluation. Asking Stockfish anyway costs a depth-14 search and
     returns `mate 0`, whose sign the UCI protocol cannot express. */
  const terminal = terminalEval(fen);
  if (terminal) {
    const entry = { evaluation: terminal, bestMove: null, pv: [], depth: ANALYSIS_DEPTH };
    engine.setAnalysis(ply, entry);
    if (useGame.getState().plies.length === ply) {
      engine.patch({ liveEval: terminal, liveDepth: ANALYSIS_DEPTH, settled: true });
    }
    return entry;
  }

  engine.patch({ settled: false });
  try {
    const result = await getAnalyst().search({
      fen,
      depth: ANALYSIS_DEPTH,
      onInfo: (info) => {
        if (info.depth < COMMIT_DEPTH) return;
        if (useGame.getState().plies.length !== ply) return; // stale search
        useEngine.getState().patch({ liveEval: info.evaluation, liveDepth: info.depth });
      },
    });
    const entry = {
      evaluation: result.evaluation,
      bestMove: result.bestMove,
      pv: result.pv,
      depth: result.depth,
    };
    useEngine.getState().setAnalysis(ply, entry);
    if (useGame.getState().plies.length === ply) {
      useEngine.getState().patch({
        liveEval: result.evaluation,
        liveDepth: result.depth,
        settled: true,
      });
    }
    return entry;
  } catch (error) {
    if ((error as Error).name === "AbortError") return null;
    useEngine.getState().patch({ error: (error as Error).message, settled: true });
    return null;
  }
}

/**
 * Judges the player's move using two searches at the same depth: the position
 * before it (which also supplies the engine's preferred move) and the position
 * after. Both are already normalised to White, so the only care needed is
 * flipping the delta into the mover's point of view.
 */
async function judgeAndExplain(record: PlyRecord) {
  const settings = useSettings.getState();
  const before =
    useEngine.getState().analysis[record.ply - 1] ??
    (await analyse(record.ply - 1, record.fenBefore));
  const after =
    useEngine.getState().analysis[record.ply] ?? (await analyse(record.ply, record.fenAfter));
  if (!before || !after) return;

  const moverIsWhite = record.side === "white";
  const winBefore = evalToWinPct(before.evaluation);
  const winAfter = evalToWinPct(after.evaluation);
  const moverBefore = moverIsWhite ? winBefore : 100 - winBefore;
  const moverAfter = moverIsWhite ? winAfter : 100 - winAfter;
  const drop = moverBefore - moverAfter;

  const playedUci = uciOf(record);
  const isBest = before.bestMove === playedUci;
  const quality = classify(drop, isBest);
  const bestSan = before.bestMove ? uciToSan(record.fenBefore, before.bestMove) : null;

  const threshold = SENSITIVITY_THRESHOLD[settings.sensitivity];
  const praiseworthy = isBest && settings.praiseGoodMoves;
  if (drop < threshold && !praiseworthy) return;
  if (settings.timing === "post-game" && useGame.getState().status !== "over") return;

  const annotation = {
    ply: record.ply,
    moveNumber: record.moveNumber,
    side: record.side,
    playedSan: record.san,
    bestSan: bestSan ?? record.san,
    evalBefore: before.evaluation,
    evalAfter: after.evaluation,
    winPctBefore: Number(moverBefore.toFixed(1)),
    winPctAfter: Number(moverAfter.toFixed(1)),
    quality,
    pvSan: uciLineToSan(record.fenBefore, before.pv),
    fenBefore: record.fenBefore,
    stage: "retrieving" as const,
    prose: "",
    concepts: [],
  };
  useCoach.getState().upsert(record.ply, annotation);

  const controller = new AbortController();
  coachAborts.get(record.ply)?.abort();
  coachAborts.set(record.ply, controller);
  await requestExplanation(annotation, settings, controller.signal);
}

let starting = false;

export async function startGame() {
  // React re-runs mount effects in development; booting two engines at once
  // would leave one of them orphaned mid-handshake.
  if (starting) return;
  starting = true;
  const settings = useSettings.getState();
  const playerColor: PieceColor =
    settings.side === "random" ? (Math.random() < 0.5 ? "w" : "b") : settings.side === "white" ? "w" : "b";

  for (const controller of coachAborts.values()) controller.abort();
  coachAborts = new Map();
  hintAbort?.abort();
  useHint.getState().clear();
  chess = new Chess();
  useCoach.getState().clear();
  useEngine.getState().reset();
  useGame.getState().reset(playerColor);
  syncPosition();
  announce(null);

  useEngine.getState().patch({ loading: true, error: null });
  try {
    await getOpponent(settings.elo).init();
    await setOpponentElo(settings.elo);
    await getAnalyst().init();
    useEngine.getState().patch({ ready: true, loading: false });
  } catch (error) {
    useEngine.getState().patch({
      loading: false,
      ready: false,
      error:
        (error as Error).name === "AbortError"
          ? null
          : `Could not start Stockfish: ${(error as Error).message}`,
    });
    return;
  } finally {
    starting = false;
  }

  void analyse(0, chess.fen());
  if (playerColor === "b") void engineReply();
}

/**
 * Would this move leave the piece it moves attacked and undefended?
 *
 * Pure chess.js on a throwaway board, so it costs nothing — this is the same test
 * `positionFeatures` already runs to tag a position, just asked before the move
 * instead of after it. No engine search is involved, which is why the board never
 * stalls while the question is answered.
 *
 * Tuned against false positives, because a guard that cries wolf gets switched off:
 * pawns are ignored, and a capture that wins material of similar or greater value is
 * a trade rather than a gift.
 */
function hangingAfter(
  from: Square,
  to: Square,
  promotion?: PieceType,
): { piece: PieceType; square: Square } | null {
  const board = new Chess(chess.fen());
  let move;
  try {
    move = board.move({ from, to, promotion });
  } catch {
    return null;
  }
  if (move.piece === "p") return null;

  const captured = move.captured as PieceType | undefined;
  if (captured && VALUE[captured] >= VALUE[move.piece]) return null;

  const opponent = move.color === "w" ? "b" : "w";
  if (!board.isAttacked(move.to, opponent)) return null;
  if (board.attackers(move.to, move.color).length > 0) return null;

  return { piece: move.piece as PieceType, square: move.to };
}

const PIECE_NAME: Record<PieceType, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** True when the move needs a promotion choice before it can be played. */
export function needsPromotion(from: Square, to: Square) {
  return chess
    .moves({ verbose: true })
    .some((move) => move.from === from && move.to === to && Boolean(move.promotion));
}

export async function playMove(
  from: Square,
  to: Square,
  promotion?: PieceType,
  /** Set once the player has seen and dismissed the hanging-piece warning. */
  confirmed = false,
) {
  const game = useGame.getState();
  if (game.status !== "playing" || chess.turn() !== game.playerColor) return false;

  if (!confirmed && warnsOnHangingPiece(useSettings.getState().level)) {
    const risk = hangingAfter(from, to, promotion);
    if (risk) {
      game.patch({
        pendingPromotion: null,
        pendingRisk: {
          from,
          to,
          promotion,
          reason: `Your ${PIECE_NAME[risk.piece]} would be attacked on ${risk.square} with nothing defending it.`,
        },
      });
      return false;
    }
  }

  const fenBefore = chess.fen();
  let move;
  try {
    move = chess.move({ from, to, promotion });
  } catch {
    playCue("illegal");
    return false;
  }

  const record = toRecord(move, fenBefore);
  if (useGame.getState().hintStage > 0) game.markHinted(record.ply);
  game.appendPly(record);
  game.patch({ pendingPromotion: null, pendingRisk: null });
  syncPosition();
  announce(record);
  playCue(cueForMove(move));

  const result = resultOf(chess, game.playerColor);
  if (result) {
    useGame.getState().patch({ status: "over", result });
    playCue(outcomeCue(result));
    void finishAnalysis(record);
    return true;
  }

  // Judging runs on the analyst worker; the reply runs on the opponent worker.
  // Neither waits for the other, so commentary never delays the game.
  void judgeAndExplain(record);
  void engineReply();
  return true;
}

async function finishAnalysis(record: PlyRecord) {
  await analyse(record.ply, record.fenAfter);
  await judgeAndExplain(record);
}

async function engineReply() {
  const settings = useSettings.getState();
  useGame.getState().patch({ status: "thinking" });
  const fenBefore = chess.fen();
  try {
    const result = await getOpponent(settings.elo).search({
      fen: fenBefore,
      movetimeMs: settings.thinkMs,
    });
    if (!result.bestMove) {
      useGame.getState().patch({ status: "playing" });
      return;
    }
    const move = chess.move(splitUci(result.bestMove));
    const record = toRecord(move, fenBefore);
    const game = useGame.getState();
    game.appendPly(record);
    syncPosition();
    announce(record);
    playCue(cueForMove(move));

    const outcome = resultOf(chess, game.playerColor);
    game.patch({ status: outcome ? "over" : "playing", result: outcome });
    if (outcome) playCue(outcomeCue(outcome));
    void analyse(record.ply, record.fenAfter);
  } catch (error) {
    useGame.getState().patch({ status: "playing" });
    if ((error as Error).name !== "AbortError") {
      useEngine.getState().patch({ error: (error as Error).message });
    }
  }
}

/** Rewinds to just before the player's last move so it can be played again. */
export function retryMove() {
  const game = useGame.getState();
  const plies = game.plies;
  if (plies.length === 0) return;

  // Drop the engine's reply too, if it has already answered.
  const count = plies.at(-1)!.side === (game.playerColor === "w" ? "black" : "white") ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    const dropped = chess.history().length;
    coachAborts.get(dropped)?.abort();
    coachAborts.delete(dropped);
    useCoach.setState((state) => {
      const byPly = { ...state.byPly };
      delete byPly[dropped];
      return { byPly };
    });
    chess.undo();
  }
  game.truncate(count);
  syncPosition();
  announce(plies.at(-1 - count) ?? null);
  playCue("back");
  void analyse(chess.history().length, chess.fen());
}

export function resign() {
  const game = useGame.getState();
  if (game.status === "over") return;
  playCue("loss");
  game.patch({
    status: "over",
    result: {
      outcome: `${game.playerColor === "w" ? "White" : "Black"} resigned`,
      detail: `${game.playerColor === "w" ? "Black" : "White"} wins · move ${Math.ceil(
        game.plies.length / 2,
      )}`,
      playerWon: false,
    },
  });
}

/** Plays a move the player has been warned about. */
export function confirmPendingRisk() {
  const pending = useGame.getState().pendingRisk;
  if (!pending) return;
  useGame.getState().patch({ pendingRisk: null });
  void playMove(pending.from, pending.to, pending.promotion as PieceType | undefined, true);
}

export function dismissPendingRisk() {
  useGame.getState().patch({ pendingRisk: null, selected: null });
}

/** The engine's move for the position on the board, or null while it is thinking.
 *  Already searched: `analyse` runs after every ply, so this is a store read. */
export function bestMoveHere(): { uci: string; san: string } | null {
  const { plies } = useGame.getState();
  const entry = useEngine.getState().analysis[plies.length];
  if (!entry?.bestMove) return null;
  const san = uciToSan(chess.fen(), entry.bestMove);
  return san ? { uci: entry.bestMove, san } : null;
}

/**
 * One more layer of the engine's recommendation: first which piece to move, then
 * the move itself. Staged rather than instant so the hint stays a nudge — being
 * told "the knight" and finding Nd5 yourself is the part that teaches.
 */
export function revealHint() {
  const game = useGame.getState();
  if (!bestMoveHere()) return;
  game.revealHint();
  game.markHinted(game.plies.length + 1);
}

/** The "?" beside the hint. Shows the move, then streams why it is the move. */
export function explainHint() {
  const game = useGame.getState();
  const best = bestMoveHere();
  if (!best) return;

  game.patch({ hintStage: 2 });
  game.markHinted(game.plies.length + 1);

  hintAbort?.abort();
  hintAbort = new AbortController();
  void requestHintReason(
    {
      ply: game.plies.length,
      fen: chess.fen(),
      bestSan: best.san,
      side: chess.turn() === "w" ? "white" : "black",
    },
    useSettings.getState(),
    hintAbort.signal,
  );
}

/**
 * Rebuilds the live board from a persisted game.
 *
 * The store keeps the moves; this module keeps the chess.js instance, and a reload
 * throws the latter away. Replaying the SAN list rather than loading the final FEN
 * is deliberate: a board loaded from FEN has no history, which breaks both
 * threefold-repetition detection and take-backs.
 */
export async function resumeGame() {
  const game = useGame.getState();
  if (game.plies.length === 0 || chess.history().length > 0) return;

  chess = new Chess();
  for (const ply of game.plies) {
    try {
      chess.move(ply.san);
    } catch {
      // A record we cannot replay means the save is corrupt; start over rather
      // than leave the board and the store describing different positions.
      void startGame();
      return;
    }
  }
  syncPosition();
  announce(game.plies.at(-1) ?? null);

  useEngine.getState().patch({ loading: true, error: null });
  try {
    const settings = useSettings.getState();
    await getOpponent(settings.elo).init();
    await setOpponentElo(settings.elo);
    await getAnalyst().init();
    useEngine.getState().patch({ ready: true, loading: false });
  } catch (error) {
    useEngine.getState().patch({ loading: false, ready: false, error: (error as Error).message });
    return;
  }

  // The hint and the eval bar both read the current position's search.
  void analyse(chess.history().length, chess.fen());
  const playerTurn = chess.turn() === game.playerColor;
  if (!playerTurn && game.status !== "over") void engineReply();
}

export function currentFen() {
  return chess.fen();
}

export function history() {
  return chess.history();
}

export function evaluationAt(ply: number): Evaluation | null {
  return useEngine.getState().analysis[ply]?.evaluation ?? null;
}
