import { describe, expect, it } from "vitest";
import { createClient, type RedisClientType } from "redis";
import { encodeEntry, isReserved, releasePair, tryPair } from "./queue";

/* ── The double-pairing race ──────────────────────────────────────────────────
   The bug this pins produced two games for one pair of players, each holding half
   the moves — which presented as "nothing syncs between the two browsers".

   The sequence that caused it: A's request pairs the two and starts writing the game.
   `publishMatch` only happens *after* that write, so for its duration B has nothing to
   claim. B's heartbeat lands in that window, and because `POST /api/queue` enqueues
   before it pairs, B rejoins the queue. A's own in-flight beat does the same. Both are
   queued again, still unpaired as far as Redis is concerned, and the next `tryPair`
   matches them a second time.

   Run against real Redis. The whole failure is a race between round trips, so a mock
   would assert only that the code calls the commands it calls — it could not have
   caught this and would not catch a regression. Skipped without REDIS_URL.
   ─────────────────────────────────────────────────────────────────────────── */

const url = process.env.REDIS_URL ?? process.env.KV_URL;
const CONTROL = "rapid10" as const;
const KEY = `queue:${CONTROL}`;
const A = "raceUserA";
const B = "raceUserB";

async function fresh(): Promise<RedisClientType> {
  const client = createClient({ url }) as RedisClientType;
  client.on("error", () => {});
  await client.connect();
  await client.del(KEY);
  await client.del([`pairing:${A}`, `pairing:${B}`]);
  return client;
}

async function queueBoth(client: RedisClientType): Promise<void> {
  const now = Date.now();
  const entry = (userId: string) => ({
    userId,
    rating: 1500,
    joinedAt: now - 5_000,
    seenAt: now,
    provisional: false,
  });
  await client.zAdd(KEY, [
    { score: 1500, value: encodeEntry(entry(A)) },
    { score: 1500, value: encodeEntry(entry(B)) },
  ]);
}

describe.skipIf(!url)("concurrent pairing", () => {
  it("does not pair the same two people twice while the first game is being written", async () => {
    const client = await fresh();
    await queueBoth(client);

    // A's beat wins the pairing. The reservation is now held by both.
    const first = await tryPair({ control: CONTROL, userId: A, rating: 1500, rd: 50 });
    expect(first).not.toBeNull();
    expect(await isReserved(A)).toBe(true);
    expect(await isReserved(B)).toBe(true);

    /* Both clients beat again before `publishMatch` lands, so both rejoin the queue —
       exactly what the route does, and what made the second game. */
    await queueBoth(client);

    const second = await tryPair({ control: CONTROL, userId: B, rating: 1500, rd: 50 });
    // Before the reservation this returned a pairing, and the route wrote game two.
    expect(second).toBeNull();

    // Neither player is stranded: the rollback puts both back for the next beat.
    expect(await client.zCard(KEY)).toBe(2);

    await releasePair(A, B);
    expect(await isReserved(A)).toBe(false);

    await client.del(KEY);
    await client.del([`pairing:${A}`, `pairing:${B}`]);
    await client.quit();
  });

  it("never yields two pairings when both beats land at the same instant", async () => {
    const client = await fresh();
    await queueBoth(client);

    const results = await Promise.all([
      tryPair({ control: CONTROL, userId: A, rating: 1500, rd: 50 }),
      tryPair({ control: CONTROL, userId: B, rating: 1500, rd: 50 }),
    ]);

    /* One is the good case; zero is the pre-existing mutual rollback, where each
       removed the other and neither could remove itself. Both are safe — the next
       beat pairs them. Two is the bug, and two is what must never happen. */
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);

    await releasePair(A, B);
    await client.del(KEY);
    await client.del([`pairing:${A}`, `pairing:${B}`]);
    await client.quit();
  });
});
