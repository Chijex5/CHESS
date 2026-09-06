import "server-only";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games, moves, offers, players } from "@/lib/db/schema";
import { applyGame, type Rating } from "@/lib/game/rating";
import { publishChange } from "@/lib/realtime/bus";
import { gameId as newGameId } from "./ids";
import { publicPlayer } from "./players";
import {
  endingOf,
  flagged,
  judgeMove,
  remaining,
  replay,
  timeoutResult,
  type StoredMove,
} from "./rules";
import type {
  GameEnding,
  GameSnapshot,
  GameWinner,
  MoveRequest,
  Seat,
} from "./protocol";

/* ── The game, as the server sees it ──────────────────────────────────────────
   Every function here is the only path to its part of the game's life, so the
   invariants live in one file rather than in whichever route happened to need
   them: a game starts once, a move is validated before it is written, a result is
   recorded once and ratings are applied exactly with it.
   ─────────────────────────────────────────────────────────────────────────── */

export type CreateOptions = {
  createdBy: string;
  /** Seat the creator takes. "random" is resolved now, so the link cannot be
   *  reloaded until it deals a colour the creator prefers. */
  side: Seat | "random";
  initialMs: number;
  incrementMs: number;
  rated: boolean;
};

export async function createGame(options: CreateOptions): Promise<string> {
  const seat: Seat =
    options.side === "random" ? (Math.random() < 0.5 ? "white" : "black") : options.side;
  const id = newGameId();
  await db.insert(games).values({
    id,
    whiteId: seat === "white" ? options.createdBy : null,
    blackId: seat === "black" ? options.createdBy : null,
    initialMs: options.initialMs,
    incrementMs: options.incrementMs,
    rated: options.rated ? 1 : 0,
    status: "pending",
  });
  return id;
}

/**
 * Seats a second player.
 *
 * The `isNull` in the WHERE clause is doing the real work: two people opening the
 * same link at the same moment both reach here, and only one of them updates a row.
 * The loser reads the game back and finds it full, which is correct rather than an
 * error — the same shape as any first-come claim.
 */
export async function joinGame(
  id: string,
  userId: string,
): Promise<{ seat: Seat; startedAt: Date } | null> {
  const game = await gameRow(id);
  if (!game || game.status !== "pending") return null;
  if (game.whiteId === userId || game.blackId === userId) {
    return game.startedAt
      ? { seat: game.whiteId === userId ? "white" : "black", startedAt: game.startedAt }
      : null;
  }

  const seat: Seat = game.whiteId === null ? "white" : "black";
  const startedAt = new Date();
  const [claimed] = await db
    .update(games)
    .set({
      ...(seat === "white" ? { whiteId: userId } : { blackId: userId }),
      status: "active",
      startedAt,
    })
    .where(
      and(
        eq(games.id, id),
        eq(games.status, "pending"),
        seat === "white" ? isNull(games.whiteId) : isNull(games.blackId),
      ),
    )
    .returning();

  if (!claimed) return null;
  await publishChange(id, 0);
  return { seat, startedAt };
}

export async function gameRow(id: string) {
  const [row] = await db.select().from(games).where(eq(games.id, id));
  return row ?? null;
}

async function moveRows(id: string) {
  return db.select().from(moves).where(eq(moves.gameId, id)).orderBy(asc(moves.seq));
}

function toStored(row: Awaited<ReturnType<typeof moveRows>>[number]): StoredMove {
  return {
    seq: row.seq,
    san: row.san,
    msLeftWhite: row.msLeftWhite,
    msLeftBlack: row.msLeftBlack,
    playedAt: row.playedAt,
  };
}

/** When the side on the move started thinking: the last move's timestamp, or the
 *  moment the second player sat down. */
function turnStart(game: { startedAt: Date | null }, last: StoredMove | null): number {
  return last?.playedAt ?? game.startedAt?.getTime() ?? Date.now();
}

export async function snapshot(id: string, userId: string | null): Promise<GameSnapshot | null> {
  let game = await gameRow(id);
  if (!game) return null;

  /* A game whose clock has run out is over whether or not anyone was watching. It is
     settled here rather than by a scheduled job because this is the function every
     path already calls — the event stream re-reads it on each heartbeat, so an
     abandoned game resolves as soon as either player's tab is open, and otherwise
     the moment somebody looks at it. `finish` is guarded on `status = 'active'`, so
     two streams noticing at once still record one result. */
  const fallen = await settleFlag(game);
  if (fallen) game = fallen;

  const rows = await moveRows(id);
  const last = rows.length ? toStored(rows[rows.length - 1]) : null;
  const clock = { initialMs: game.initialMs, incrementMs: game.incrementMs };
  const now = Date.now();
  const turnStartedAt = turnStart(game, last);

  /* Banked as of the last move, *not* projected to now. A projected number is
     already stale by the time it is serialised, and the client has to project
     continuously anyway — so it gets the fixed point plus `turnStartedAt` and does
     the arithmetic itself. Sending both would mean projecting twice. */
  const banked = remaining(clock, last);

  const [white, black, offer] = await Promise.all([
    game.whiteId ? playerRow(game.whiteId) : null,
    game.blackId ? playerRow(game.blackId) : null,
    openOffer(id),
  ]);

  return {
    id: game.id,
    status: game.status,
    white,
    black,
    seat: userId
      ? game.whiteId === userId
        ? "white"
        : game.blackId === userId
          ? "black"
          : null
      : null,
    sans: rows.map((row) => row.san),
    seq: rows.length,
    initialMs: game.initialMs,
    incrementMs: game.incrementMs,
    msLeftWhite: banked.white,
    msLeftBlack: banked.black,
    turnStartedAt,
    serverNow: now,
    winner: game.winner,
    ending: game.ending,
    offer,
    rated: game.rated === 1,
  };
}

/** Ends a game whose clock has expired, and returns the updated row. */
async function settleFlag(game: NonNullable<Awaited<ReturnType<typeof gameRow>>>) {
  if (game.status !== "active" || game.initialMs === 0) return null;

  const rows = await moveRows(game.id);
  const last = rows.length ? toStored(rows[rows.length - 1]) : null;
  const turn = replay(rows.map((row) => row.san)).turn;
  const loser = flagged({
    clock: { initialMs: game.initialMs, incrementMs: game.incrementMs },
    last,
    turn,
    turnStartedAt: turnStart(game, last),
    now: Date.now(),
  });
  if (!loser) return null;

  const result = timeoutResult(loser);
  await finish(game.id, result.winner, result.ending);
  return gameRow(game.id);
}

async function playerRow(id: string) {
  const [row] = await db.select().from(players).where(eq(players.clerkUserId, id));
  return row ? publicPlayer(row) : null;
}

async function openOffer(id: string) {
  const [row] = await db.select().from(offers).where(eq(offers.gameId, id));
  if (!row) return null;
  return { kind: row.kind, by: row.offeredBy as Seat };
}

export type SubmitResult =
  | { ok: true; seq: number; san: string }
  | { ok: false; reason: string; status: number };

/**
 * Validates and records one move.
 *
 * Everything is decided from the stored log rather than from anything the client
 * sent beyond the move itself, so a tampered client can only ever be refused. The
 * insert relies on `(game_id, seq)` for the last word: if two requests race past
 * validation, the second violates the primary key and is refused there.
 */
export async function submitMove(
  id: string,
  userId: string,
  request: MoveRequest,
): Promise<SubmitResult> {
  const game = await gameRow(id);
  if (!game) return { ok: false, reason: "no-such-game", status: 404 };
  if (game.status !== "active") return { ok: false, reason: "game-not-active", status: 409 };

  const seat: Seat | null =
    game.whiteId === userId ? "white" : game.blackId === userId ? "black" : null;
  if (!seat) return { ok: false, reason: "not-a-player", status: 403 };

  const rows = await moveRows(id);
  const last = rows.length ? toStored(rows[rows.length - 1]) : null;
  const now = Date.now();

  const verdict = judgeMove({
    sans: rows.map((row) => row.san),
    clock: { initialMs: game.initialMs, incrementMs: game.incrementMs },
    seat,
    from: request.from,
    to: request.to,
    promotion: request.promotion,
    expectedSeq: request.seq,
    now,
    turnStartedAt: turnStart(game, last),
    last,
  });

  if (!verdict.ok) {
    /* A flag found while trying to move is a real result, not a rejection to
       retry: the player's time is gone whatever they meant to play. */
    if (verdict.reason === "flagged") {
      await finish(id, seat === "white" ? "black" : "white", "timeout");
      return { ok: false, reason: "flagged", status: 409 };
    }
    return { ok: false, reason: verdict.reason, status: 409 };
  }

  try {
    await db.insert(moves).values({
      gameId: id,
      seq: verdict.seq,
      san: verdict.san,
      uci: verdict.uci,
      fenAfter: verdict.fenAfter,
      msLeftWhite: verdict.msLeftWhite,
      msLeftBlack: verdict.msLeftBlack,
      playedAt: verdict.playedAt,
    });
  } catch {
    // The primary key refused it: someone else already played this ply.
    return { ok: false, reason: "out-of-sequence", status: 409 };
  }

  // A move answers any outstanding offer by ignoring it.
  await db.delete(offers).where(eq(offers.gameId, id));

  if (verdict.ending) {
    await finish(id, verdict.ending.winner, verdict.ending.ending);
  } else {
    await publishChange(id, verdict.seq);
  }

  return { ok: true, seq: verdict.seq, san: verdict.san };
}

/**
 * Records the result, once.
 *
 * The `eq(status, "active")` guard is what makes this idempotent: a flag claimed by
 * both players' streams at the same instant, or a resignation racing a checkmate,
 * updates one row and the second call finds nothing to do. Ratings are applied in
 * the same call for the same reason — they must not be able to run twice.
 */
export async function finish(
  id: string,
  winner: GameWinner,
  ending: GameEnding,
): Promise<{ ratings: Record<Seat, { before: number; after: number }> | null } | null> {
  const [closed] = await db
    .update(games)
    .set({ status: "finished", winner, ending, endedAt: new Date() })
    .where(and(eq(games.id, id), eq(games.status, "active")))
    .returning();
  if (!closed) return null;

  await db.delete(offers).where(eq(offers.gameId, id));

  let ratings: Record<Seat, { before: number; after: number }> | null = null;
  if (closed.rated === 1 && closed.whiteId && closed.blackId) {
    ratings = await applyRatings(closed.whiteId, closed.blackId, winner);
  }

  await publishChange(id, -1);
  return { ratings };
}

async function applyRatings(whiteId: string, blackId: string, winner: GameWinner) {
  const rows = await db
    .select()
    .from(players)
    .where(or(eq(players.clerkUserId, whiteId), eq(players.clerkUserId, blackId)));
  const before = new Map(rows.map((row) => [row.clerkUserId, row]));
  const w = before.get(whiteId);
  const b = before.get(blackId);
  if (!w || !b) return null;

  const asRating = (row: typeof w): Rating => ({
    rating: row.rating,
    rd: row.rd,
    volatility: row.volatility,
  });
  const next = applyGame(asRating(w), asRating(b), winner);

  await Promise.all([
    db
      .update(players)
      .set({ ...next.white, gamesPlayed: w.gamesPlayed + 1 })
      .where(eq(players.clerkUserId, whiteId)),
    db
      .update(players)
      .set({ ...next.black, gamesPlayed: b.gamesPlayed + 1 })
      .where(eq(players.clerkUserId, blackId)),
  ]);

  return {
    white: { before: Math.round(w.rating), after: Math.round(next.white.rating) },
    black: { before: Math.round(b.rating), after: Math.round(next.black.rating) },
  };
}

/** Games this player is in, newest first. */
export async function myGames(userId: string, limit = 20) {
  return db
    .select()
    .from(games)
    .where(or(eq(games.whiteId, userId), eq(games.blackId, userId)))
    .orderBy(desc(games.createdAt))
    .limit(limit);
}

export { endingOf };
