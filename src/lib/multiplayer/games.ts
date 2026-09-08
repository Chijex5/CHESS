import "server-only";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games, messages, moves, offers, players, type Game } from "@/lib/db/schema";
import { applyGame, type Rating } from "@/lib/game/rating";
import { publishChange } from "@/lib/realtime/bus";
import { archiveFinished } from "./archive";
import {
  HOUSE_ID,
  HOUSE_USERNAME,
  botDisplayName,
  housePlayer,
  isHouse,
} from "./bot";
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
import { REMATCH_WINDOW_MS } from "./protocol";
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
  /** Addressed to one person: only they can take the other seat. A challenge rather
   *  than a link, which is the difference between "here is a game" and "I am asking
   *  you". */
  invitedId?: string | null;
};

/**
 * Creates a game with both seats already filled — the matchmaking path.
 *
 * Distinct from `createGame` on purpose. An invite link creates a half-empty game and
 * waits for somebody to claim the other seat, because it does not know who is coming.
 * A pairing knows both players, so it seats both in one insert and starts the clock
 * immediately: routing one of them through `joinGame` afterwards left a window where
 * the game existed with a seat still open, which is how a stale queue entry ended up
 * being paired into a game neither matched player was sitting in.
 *
 * Also the rematch path, which is the same shape — two known players, no seat to
 * claim — and the reason `rated` is a parameter rather than always 1.
 */
export async function createPairedGame(options: {
  white: string;
  black: string;
  initialMs: number;
  incrementMs: number;
  rated: boolean;
  engineElo?: number | null;
}): Promise<string> {
  const id = newGameId();
  const startedAt = new Date();
  await db.insert(games).values({
    id,
    whiteId: options.white,
    blackId: options.black,
    initialMs: options.initialMs,
    incrementMs: options.incrementMs,
    rated: options.rated ? 1 : 0,
    engineElo: options.engineElo ?? null,
    status: "active",
    startedAt,
  });
  await publishChange(id, 0);
  return id;
}

/** Creates the engine's one shared row, if it is not already there. Done on the fallback
 *  path rather than seeded by a migration, so a fresh database needs no extra step. */
async function ensureHousePlayer(): Promise<void> {
  await db
    .insert(players)
    .values({
      clerkUserId: HOUSE_ID,
      username: HOUSE_USERNAME,
      /* Never read — `housePlayer` takes the rating from the game — but a row has to have
         one, and 1500 is the unrated default rather than a claim. */
      rating: 1500,
      rd: 350,
      volatility: 0.06,
    })
    .onConflictDoNothing({ target: players.clerkUserId });
}

/**
 * Creates a game against the engine, wearing a human-looking name.
 *
 * The seat is the one house account; the name the player sees is a column on this game.
 * It used to be a fresh `players` row per game with the name as its username, which
 * `players.username` being UNIQUE made a collision waiting to happen — see `bot.ts` for
 * the three ways that went wrong.
 *
 * Unrated, and that is not incidental: an invented opponent must never move a real
 * player's rating. `finish` already declines to apply ratings to an unrated game.
 */
export async function createEngineFallbackGame(options: {
  playerId: string;
  rating: number;
  initialMs: number;
  incrementMs: number;
}): Promise<string> {
  const id = newGameId();
  /* Within twenty points of the player, clamped to what the engine can actually be set
     to. A fallback that is obviously weaker or obviously stronger reads as a consolation
     prize rather than a game. */
  const engineElo = Math.max(
    1320,
    Math.min(3190, Math.round(options.rating + (Math.floor(Math.random() * 41) - 20))),
  );

  await ensureHousePlayer();

  const humanWhite = Math.random() < 0.5;
  await db.insert(games).values({
    id,
    whiteId: humanWhite ? options.playerId : HOUSE_ID,
    blackId: humanWhite ? HOUSE_ID : options.playerId,
    initialMs: options.initialMs,
    incrementMs: options.incrementMs,
    rated: 0,
    engineElo,
    botName: botDisplayName(),
    status: "active",
    startedAt: new Date(),
  });
  await publishChange(id, 0);
  return id;
}

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
    invitedId: options.invitedId ?? null,
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
  /* A challenge names its opponent, so anybody else following the link is a spectator
     of an empty board rather than a player. Checked here rather than in the route
     because this is the only function that seats anyone. */
  if (game.invitedId && game.invitedId !== userId) return null;

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

/** The offer policy needs the authoritative position too; never trust a client FEN. */
export async function moveRowsForGame(id: string) {
  return moveRows(id);
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

  /* The house seat is drawn from this game rather than looked up: one row is shared by
     every fallback game, so its username and rating say nothing about this one. The
     name is on the game and the strength is `engineElo`. */
  const [white, black, offer, chatSeq] = await Promise.all([
    isHouse(game.whiteId) ? housePlayer(game) : game.whiteId ? playerRow(game.whiteId) : null,
    isHouse(game.blackId) ? housePlayer(game) : game.blackId ? playerRow(game.blackId) : null,
    openOffer(id),
    lastMessageId(id),
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
    endedAt: game.endedAt?.getTime() ?? null,
    rematchId: game.rematchId,
    chatSeq,
    rated: game.rated === 1,
    engineElo: game.engineElo,
    ratings:
      game.whiteRatingAfter !== null && game.blackRatingAfter !== null
        ? {
            white: {
              before: game.whiteRatingBefore ?? game.whiteRatingAfter,
              after: game.whiteRatingAfter,
            },
            black: {
              before: game.blackRatingBefore ?? game.blackRatingAfter,
              after: game.blackRatingAfter,
            },
          }
        : null,
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

/** The chat cursor. One indexed lookup, so it costs a snapshot nothing. */
async function lastMessageId(id: string): Promise<number> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.gameId, id))
    .orderBy(desc(messages.id))
    .limit(1);
  return row?.id ?? 0;
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

/** A queue fallback may only be advanced by its human opponent, but the move is
 * adjudicated as the synthetic seat so all normal clock and legality rules apply. */
export async function submitEngineMove(
  id: string,
  userId: string,
  request: MoveRequest,
): Promise<SubmitResult> {
  const game = await gameRow(id);
  if (!game || game.engineElo === null) {
    return { ok: false, reason: "not-an-engine-game", status: 404 };
  }
  const botSeat = isHouse(game.whiteId) ? "white" : isHouse(game.blackId) ? "black" : null;
  if (!botSeat) return { ok: false, reason: "not-an-engine-game", status: 404 };
  const humanId = botSeat === "white" ? game.blackId : game.whiteId;
  // Only the human in this game may advance it, and only ever the other seat.
  if (humanId !== userId) return { ok: false, reason: "not-a-player", status: 403 };
  return submitMove(id, HOUSE_ID, request);
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
    if (ratings) {
      // Recorded on the game so a reload still shows what it cost or paid.
      await db
        .update(games)
        .set({
          whiteRatingBefore: ratings.white.before,
          whiteRatingAfter: ratings.white.after,
          blackRatingBefore: ratings.black.before,
          blackRatingAfter: ratings.black.after,
        })
        .where(eq(games.id, id));
    }
  }

  /* After the ratings, so the archived row can say what the opponent was rated when
     you played them rather than what the game left them on. Awaited rather than fired
     and forgotten: on a serverless function the request may be frozen the moment this
     one returns, and a dropped write here is a game missing from a history page. */
  await archiveFinished(closed, winner, ending, ratings);

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

/* ── Rematch ──────────────────────────────────────────────────────────────────
   A finished game is immutable except for one field: where the two of them went
   next. Everything below is about setting that field exactly once, because the whole
   point is that both players end up in the *same* new game — two games would be
   worse than none.
   ─────────────────────────────────────────────────────────────────────────── */

export type RematchResult =
  /** Agreed. `rematchId` is the game to go to; null means the request was recorded
   *  (an offer made, or an offer declined) and there is nowhere to go yet. */
  | { ok: true; rematchId: string | null }
  | { ok: false; reason: string; status: number };

type Refusal = { ok: false; reason: string; status: number };

/** Where a rematch offer may be made or answered, and by whom. */
async function rematchable(
  id: string,
  userId: string,
): Promise<Refusal | { ok: true; game: Game; seat: Seat }> {
  const game = await gameRow(id);
  if (!game) return { ok: false, reason: "no-such-game", status: 404 };
  if (game.status !== "finished") {
    return { ok: false, reason: "game-not-finished", status: 409 };
  }
  const seat: Seat | null =
    game.whiteId === userId ? "white" : game.blackId === userId ? "black" : null;
  if (!seat) return { ok: false, reason: "not-a-player", status: 403 };
  /* The same deadline the event stream closes on. Refused here as well as hidden in
     the UI, because an offer accepted after the stream shut would leave one player
     sitting in a new game the other never heard about. */
  const endedAt = game.endedAt?.getTime() ?? null;
  if (endedAt === null || Date.now() - endedAt > REMATCH_WINDOW_MS) {
    return { ok: false, reason: "rematch-window-closed", status: 409 };
  }
  return { ok: true, game, seat };
}

export async function offerRematch(id: string, userId: string): Promise<RematchResult> {
  const found = await rematchable(id, userId);
  if (!found.ok) return found;
  const { game, seat } = found;

  // Already agreed: hand back where to go rather than opening a second negotiation.
  if (game.rematchId) return { ok: true, rematchId: game.rematchId };
  /* There is no second browser to wait for. The fallback accepts immediately and
     * preserves its hidden strength while colours swap. */
  if (game.engineElo !== null && game.whiteId && game.blackId) {
    const rematchId = await createPairedGame({
      white: game.blackId,
      black: game.whiteId,
      initialMs: game.initialMs,
      incrementMs: game.incrementMs,
      rated: false,
      engineElo: game.engineElo,
    });
    await db.update(games).set({ rematchId }).where(and(eq(games.id, id), isNull(games.rematchId)));
    await publishChange(id, -3);
    return { ok: true, rematchId };
  }

  /* If the opponent has already offered, offering back *is* accepting. Without this,
     two players who both press Rematch in the same second would each be waiting for
     the other to answer an offer that had silently replaced theirs. */
  const [open] = await db.select().from(offers).where(eq(offers.gameId, id));
  if (open?.kind === "rematch" && open.offeredBy !== seat) {
    return acceptRematch(id, userId);
  }

  await db
    .insert(offers)
    .values({ gameId: id, kind: "rematch", offeredBy: seat })
    .onConflictDoUpdate({
      target: offers.gameId,
      set: { kind: "rematch", offeredBy: seat, offeredAt: new Date() },
    });
  await publishChange(id, -2);
  return { ok: true, rematchId: null };
}

/**
 * Accepts a rematch, creating the game both players will move to.
 *
 * The new game is inserted *before* the pointer is claimed, so that the pointer never
 * refers to a game that does not exist — which the foreign key would refuse anyway.
 * The cost is that the loser of a race has an orphan to clean up, and since it is a
 * row with no moves and no players watching, deleting it is free.
 */
export async function acceptRematch(id: string, userId: string): Promise<RematchResult> {
  const found = await rematchable(id, userId);
  if (!found.ok) return found;
  const { game, seat } = found;

  if (game.rematchId) return { ok: true, rematchId: game.rematchId };

  const [open] = await db.select().from(offers).where(eq(offers.gameId, id));
  // You cannot accept your own offer, and there has to be one to accept.
  if (!open || open.kind !== "rematch" || open.offeredBy === seat) {
    return { ok: false, reason: "no-offer", status: 409 };
  }
  if (!game.whiteId || !game.blackId) {
    return { ok: false, reason: "not-a-player", status: 409 };
  }

  /* Colours swap, which is the only reason a rematch is a distinct concept rather
     than "make another game": playing the same person twice from the same side is
     half a match. Time control and `rated` are inherited — a rematch of a rated game
     is rated, as on every server, and beating the same opponent repeatedly pays less
     each time because Glicko lowers their rating as it does. */
  const rematchId = await createPairedGame({
    white: game.blackId,
    black: game.whiteId,
    initialMs: game.initialMs,
    incrementMs: game.incrementMs,
    rated: game.rated === 1,
  });

  const [claimed] = await db
    .update(games)
    .set({ rematchId })
    .where(and(eq(games.id, id), isNull(games.rematchId)))
    .returning();

  if (!claimed?.rematchId) {
    // Someone else's accept landed first. Bin ours and send both players to theirs.
    await db.delete(games).where(eq(games.id, rematchId));
    const settled = await gameRow(id);
    return settled?.rematchId
      ? { ok: true, rematchId: settled.rematchId }
      : { ok: false, reason: "rematch-failed", status: 409 };
  }

  await db.delete(offers).where(eq(offers.gameId, id));
  /* On the *old* game's channel: that is the stream both players still have open, and
     the snapshot it wakes now carries `rematchId`, which is how the player who offered
     finds out where to go. */
  await publishChange(id, -3);
  return { ok: true, rematchId };
}

export async function declineRematch(id: string, userId: string): Promise<RematchResult> {
  const found = await rematchable(id, userId);
  if (!found.ok) return found;
  await db.delete(offers).where(eq(offers.gameId, id));
  await publishChange(id, -2);
  return { ok: true, rematchId: null };
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
