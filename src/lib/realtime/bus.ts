import "server-only";
import { createClient, type RedisClientType } from "redis";

/* ── The doorbell ─────────────────────────────────────────────────────────────
   Two players in one game may have their event streams on two different Vercel
   Function instances — a connection is pinned to the instance that accepted it,
   and a new connection lands anywhere. So a move written by one instance has to
   wake up a stream held by another.

   That is all this does. It carries a sequence number, never a move. Postgres holds
   the game, so a client that misses a notification is merely behind its own cursor
   and catches up on the next one or on reconnect. The consequences:

     · pub/sub's lack of delivery guarantees costs a round trip, not a move
     · with no REDIS_URL at all, games still finish — `subscribe` returns a no-op
       and the stream falls back to its heartbeat, which is slower and completely
       correct
     · nothing here needs to be durable, so there is no log to trim or expire

   Deliberately not Vercel Queues: this is browser-facing fan-out to two
   subscribers where a missed signal is self-healing, which is the exact case the
   platform's own guidance points at pub/sub for.
   ─────────────────────────────────────────────────────────────────────────── */

const url = () => process.env.REDIS_URL ?? process.env.KV_URL ?? null;

export function realtimeAvailable(): boolean {
  return url() !== null;
}

/* One publisher per instance, lazily. A publishing client can be shared; a
   subscribing one cannot — Redis puts a connection into subscriber mode and it can
   then issue nothing else, which is why `subscribe` opens its own. */
let publisher: Promise<RedisClientType> | null = null;

async function getPublisher(): Promise<RedisClientType | null> {
  const target = url();
  if (!target) return null;
  publisher ??= (async () => {
    const client = createClient({ url: target }) as RedisClientType;
    // Without a handler a dropped connection becomes an unhandled error event and
    // takes the whole function instance down with it.
    client.on("error", () => {});
    await client.connect();
    return client;
  })();
  try {
    return await publisher;
  } catch {
    publisher = null;
    return null;
  }
}

const channelFor = (gameId: string) => `game:${gameId}`;

/** Rings the doorbell for a game. Never throws: a realtime failure must not fail a
 *  move that is already committed to Postgres. */
export async function publishChange(gameId: string, seq: number): Promise<void> {
  const client = await getPublisher();
  if (!client) return;
  try {
    await client.publish(channelFor(gameId), String(seq));
  } catch {
    // The move is durable. The other player's stream catches up on its heartbeat,
    // which is exactly the degraded mode this design allows for.
  }
}

/**
 * Listens for changes to one game. Resolves to a function that closes the
 * connection.
 *
 * The callback receives the sequence the publisher claims to have reached. Treat it
 * as a hint to go and look, not as data — the caller reads Postgres.
 */
export async function subscribe(
  gameId: string,
  onChange: (seq: number) => void,
): Promise<() => Promise<void>> {
  const target = url();
  if (!target) return async () => {};

  const client = createClient({ url: target }) as RedisClientType;
  client.on("error", () => {});
  try {
    await client.connect();
    await client.subscribe(channelFor(gameId), (message) => {
      const seq = Number(message);
      if (Number.isFinite(seq)) onChange(seq);
    });
  } catch {
    try {
      await client.destroy();
    } catch {
      // Already gone.
    }
    return async () => {};
  }

  return async () => {
    try {
      await client.unsubscribe(channelFor(gameId));
      await client.quit();
    } catch {
      // The stream is closing either way.
    }
  };
}
