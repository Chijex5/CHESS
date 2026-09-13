import "server-only";
import { createClient, type RedisClientType } from "redis";
import { PROVISIONAL_RD } from "@/lib/game/rating";
import type { TimeControlId } from "@/lib/game/time-controls";

/* ── Matchmaking ──────────────────────────────────────────────────────────────
   One sorted set per time control, scored by rating. Joining adds you; pairing looks
   for the nearest rating inside a window that widens the longer you have waited;
   matching removes both and creates the game.

   Redis rather than Postgres because the queue is not a record of anything. Nobody
   needs to know who was waiting at 3pm, entries must expire on their own when a
   laptop closes, and "who is nearest to 1520" is one command against a sorted set and
   an index scan against a table.

   Everything here is written so that two instances pairing at the same instant cannot
   both claim the same opponent: the winner is whoever's `ZREM` returns 1. That is the
   whole concurrency story, and it is why the code takes the trouble to check.
   ─────────────────────────────────────────────────────────────────────────── */

const key = (control: TimeControlId) => `queue:${control}`;
/** Where a paired player is told which game to go to. */
const matchKey = (userId: string) => `match:${userId}`;
/** How long a pairing result waits to be collected. Long enough to survive a slow
 *  poll, short enough that a stale one cannot send someone into an old game. */
const MATCH_TTL_SECONDS = 120;

/** An entry that has not heartbeat within this is gone: a tab that closed without
 *  leaving, a laptop that slept. The client beats every 2s, so this is many missed
 *  beats rather than a marginal call. */
const STALE_MS = 20_000;
/** Give a real person a brief chance to arrive before filling an empty queue. */
export const ENGINE_FALLBACK_AFTER_MS = 8_000;

let client: Promise<RedisClientType> | null = null;

async function redis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL ?? process.env.KV_URL;
  if (!url) return null;
  client ??= (async () => {
    const created = createClient({ url }) as RedisClientType;
    created.on("error", () => {});
    await created.connect();
    return created;
  })();
  try {
    return await client;
  } catch {
    client = null;
    return null;
  }
}

/* The waiting player, packed into the sorted set's member string. Rating is the score,
   so everything else that pairing needs has to travel in the member — one round trip
   instead of a lookup per candidate.

   `joinedAt` and `seenAt` are separate and both necessary. The window widens from when
   you *joined*, so that must survive a heartbeat; staleness is measured from when you
   were last *seen*, so that must be refreshed by one. An earlier version stored only
   `joinedAt` and swept on it, which expired every entry a few minutes after joining
   however alive its client was — the queue emptied itself out from under people who
   were still sitting there waiting. */
export type Entry = {
  userId: string;
  rating: number;
  joinedAt: number;
  seenAt: number;
  provisional: boolean;
};

export const encodeEntry = (entry: Entry) =>
  `${entry.userId}|${entry.joinedAt}|${entry.seenAt}|${entry.provisional ? 1 : 0}`;

export function decodeEntry(member: string, score: number): Entry | null {
  const parts = member.split("|");
  const [userId, joinedAt] = parts;
  if (!userId || !joinedAt) return null;

  /* Told apart by field count, not by position. The older form was
     `user|joinedAt|provisional`, so reading the third field as `seenAt` gives a
     timestamp of 1 — the epoch, which is instantly stale, so a deploy would sweep
     everyone who was already queued. Whoever is mid-queue during a deploy inherits
     `joinedAt` as their last-seen instead, and their next heartbeat corrects it. */
  const legacy = parts.length < 4;
  return {
    userId,
    rating: score,
    joinedAt: Number(joinedAt),
    seenAt: legacy ? Number(joinedAt) : Number(parts[2]),
    provisional: (legacy ? parts[2] : parts[3]) === "1",
  };
}

/**
 * How far from your rating a pairing may be, given how long you have waited.
 *
 * ±100 immediately, widening to ±400 by a minute. A provisional rating starts wide
 * because it is barely evidence — Glicko-2 says so with a deviation of 350, and
 * insisting on a close match to a number that means nothing would leave new players
 * waiting for no benefit.
 */
export function pairingWindow(waitedMs: number, provisional: boolean): number {
  const base = provisional ? 300 : 100;
  const widened = base + (waitedMs / 60_000) * 300;
  return Math.min(500, widened);
}

/** Joins the queue, or refreshes an entry already in it. */
export async function enqueue(input: {
  control: TimeControlId;
  userId: string;
  rating: number;
  rd: number;
}): Promise<boolean> {
  const connection = await redis();
  if (!connection) return false;

  /* Re-joining keeps the original `joinedAt` so a heartbeat does not reset the
     widening window — otherwise a client that pings every ten seconds would never
     widen past its opening ±100 and would wait forever. */
  const existing = await findEntry(input.control, input.userId);
  const entry: Entry = {
    userId: input.userId,
    rating: input.rating,
    joinedAt: existing?.joinedAt ?? Date.now(),
    seenAt: Date.now(),
    provisional: input.rd > PROVISIONAL_RD,
  };
  if (existing) {
    await connection.zRem(key(input.control), encodeEntry(existing));
  }
  await connection.zAdd(key(input.control), {
    score: input.rating,
    value: encodeEntry(entry),
  });
  return true;
}

export async function dequeue(control: TimeControlId, userId: string): Promise<void> {
  const connection = await redis();
  if (!connection) return;
  const existing = await findEntry(control, userId);
  if (existing) await connection.zRem(key(control), encodeEntry(existing));
}

/** How long this player has actually waited. Kept server-side so a reloaded tab
 * cannot skip the real-player grace period. */
export async function waitedInQueue(control: TimeControlId, userId: string): Promise<number> {
  const entry = await findEntry(control, userId);
  return entry ? Math.max(0, Date.now() - entry.joinedAt) : 0;
}

async function findEntry(
  control: TimeControlId,
  userId: string,
): Promise<Entry | null> {
  const connection = await redis();
  if (!connection) return null;
  const members = await connection.zRangeWithScores(key(control), 0, -1);
  for (const { value, score } of members) {
    const entry = decodeEntry(value, score);
    if (entry?.userId === userId) return entry;
  }
  return null;
}

/** Drops entries whose client stopped heartbeating. */
async function sweep(control: TimeControlId): Promise<void> {
  const connection = await redis();
  if (!connection) return;
  const members = await connection.zRangeWithScores(key(control), 0, -1);
  const now = Date.now();
  const dead = members
    .map(({ value, score }) => ({ value, entry: decodeEntry(value, score) }))
    // Last seen, not joined: waiting a long time is the normal case, not a fault.
    .filter(({ entry }) => !entry || isStale(entry, now))
    .map(({ value }) => value);
  if (dead.length > 0) await connection.zRem(key(control), dead);
}

/** Whether an entry's client has stopped heartbeating. */
export function isStale(entry: Entry, now: number): boolean {
  return now - entry.seenAt > STALE_MS;
}

export type Pairing = { a: string; b: string };

/**
 * Tries to pair the caller with someone already waiting.
 *
 * Called by the joining player rather than by a background worker: there is no
 * scheduler here, and the person who most wants a match is the one who just arrived.
 * Both sides are removed with `ZREM` and the pairing only proceeds if *both* removals
 * report one — if another instance took either player first, this caller has no match
 * and simply stays queued.
 */
export async function tryPair(input: {
  control: TimeControlId;
  userId: string;
  rating: number;
  rd: number;
}): Promise<Pairing | null> {
  const connection = await redis();
  if (!connection) return null;
  await sweep(input.control);

  const me = await findEntry(input.control, input.userId);
  const waited = me ? Date.now() - me.joinedAt : 0;
  const provisional = input.rd > PROVISIONAL_RD;
  const window = pairingWindow(waited, provisional);

  const candidates = await connection.zRangeByScoreWithScores(
    key(input.control),
    input.rating - window,
    input.rating + window,
  );

  const options = candidates
    .map(({ value, score }) => ({ value, entry: decodeEntry(value, score) }))
    .filter((option): option is { value: string; entry: Entry } =>
      Boolean(option.entry) && option.entry!.userId !== input.userId,
    )
    /* Nearest rating first, so a crowded queue produces even games rather than
       whoever happened to be at the bottom of the range. */
    .sort(
      (x, y) =>
        Math.abs(x.entry.rating - input.rating) - Math.abs(y.entry.rating - input.rating),
    );

  for (const option of options) {
    const tookThem = await connection.zRem(key(input.control), option.value);
    if (tookThem !== 1) continue; // Somebody else got there first.

    if (me) {
      const tookMe = await connection.zRem(key(input.control), encodeEntry(me));
      if (tookMe !== 1) {
        /* Another instance paired *us* in the meantime. Put the opponent back rather
           than stranding them, and let our own pairing be delivered by whoever won. */
        await connection.zAdd(key(input.control), {
          score: option.entry.rating,
          value: option.value,
        });
        return null;
      }
    }
    /* Both are out of the queue; now make that stick. If the reservation fails, the
       pair is already being handled by another request — put both back so neither is
       stranded out of a queue they are not actually matched in, and report no match.
       The winner's `publishMatch` will reach us on the next beat. */
    if (!(await reservePair(input.userId, option.entry.userId))) {
      await connection.zAdd(key(input.control), {
        score: option.entry.rating,
        value: option.value,
      });
      if (me) {
        await connection.zAdd(key(input.control), {
          score: me.rating,
          value: encodeEntry(me),
        });
      }
      return null;
    }

    return { a: input.userId, b: option.entry.userId };
  }
  return null;
}

/* ── One pairing at a time ────────────────────────────────────────────────────
   `tryPair` removes both players from the queue, and that used to be the whole
   guarantee. It is not enough, because being out of the queue is not a durable state:
   the client beats every 2s, and `POST /api/queue` enqueues *before* it pairs. So a
   player who was just claimed by their opponent's request rejoins the queue on their
   very next beat — and the window they rejoin in is exactly as long as it takes to
   write the new game to Postgres, because `publishMatch` only happens after that.

   Land a beat in that window and both players pair a second time, each creating their
   own game. Both boards look correct in isolation. Neither player sees the other's
   moves, because they are not in the same game — which is precisely what "nothing
   syncs" turns out to mean.

   A reservation makes "already paired" outlive the queue removal. It is taken with
   `SET NX` on both players the instant a pairing is won, so a second attempt to pair
   either of them fails on the lock rather than on an empty queue, and it is released
   once the game exists and has been published.
   ─────────────────────────────────────────────────────────────────────────── */

const reservationKey = (userId: string) => `pairing:${userId}`;

/** Long enough to outlive the game write that follows, short enough that a crash
 *  between reserving and publishing frees the player rather than stranding them. */
const RESERVATION_TTL_SECONDS = 15;

/**
 * Claims both players for one pairing, or nobody.
 *
 * `SET NX` is the whole mechanism: it succeeds exactly once per key, so of two
 * concurrent pairings of the same pair, one takes the lock and the other is refused.
 * If the second player cannot be claimed, the first is released — a half-held
 * reservation would block a player who was never actually paired.
 */
async function reservePair(a: string, b: string): Promise<boolean> {
  const connection = await redis();
  if (!connection) return false;

  /* Sorted, and that is the whole reason this works. Two requests pairing the same
     two people take these locks concurrently; taken in caller order, each grabs one,
     fails the other and rolls back — nobody is paired, which is a deadlock wearing a
     retry's clothes. It is the same canonical-ordering trick `pairKey` uses for
     friendships: put the pair in one order and the race has a winner by construction.

     A failure on the first key means somebody else owns this pairing, so there is
     nothing to undo. A failure on the second can only be a lock held by an unrelated
     pairing, and then the first must be given back. */
  const [first, second] = a < b ? [a, b] : [b, a];

  const tookFirst = await connection.set(reservationKey(first), "1", {
    NX: true,
    EX: RESERVATION_TTL_SECONDS,
  });
  if (tookFirst === null) return false;

  const tookSecond = await connection.set(reservationKey(second), "1", {
    NX: true,
    EX: RESERVATION_TTL_SECONDS,
  });
  if (tookSecond === null) {
    await connection.del(reservationKey(first));
    return false;
  }

  return true;
}

/** Frees both players once their game exists and both have been told about it. */
export async function releasePair(a: string, b: string): Promise<void> {
  const connection = await redis();
  if (!connection) return;
  await connection.del([reservationKey(a), reservationKey(b)]);
}

/** Whether this player is mid-pairing. The engine fallback asks, because a player
 *  whose game is still being written has not "waited too long" — they have already
 *  been matched and are about to be told so. */
export async function isReserved(userId: string): Promise<boolean> {
  const connection = await redis();
  if (!connection) return false;
  return (await connection.exists(reservationKey(userId))) === 1;
}

/** Tells a player which game they were paired into. */
export async function publishMatch(userId: string, gameId: string): Promise<void> {
  const connection = await redis();
  if (!connection) return;
  await connection.set(matchKey(userId), gameId, { EX: MATCH_TTL_SECONDS });
}

/** Collects a pairing result, once. */
export async function claimMatch(userId: string): Promise<string | null> {
  const connection = await redis();
  if (!connection) return null;
  const gameId = await connection.get(matchKey(userId));
  if (gameId) await connection.del(matchKey(userId));
  return gameId;
}

/** How many people are waiting, for the searching screen. */
export async function queueDepth(control: TimeControlId): Promise<number> {
  const connection = await redis();
  if (!connection) return 0;
  return connection.zCard(key(control));
}
