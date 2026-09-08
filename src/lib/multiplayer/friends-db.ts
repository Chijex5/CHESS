import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { friendships, games, players } from "@/lib/db/schema";
import { publicPlayer } from "./players";
import {
  friendshipState,
  pairKey,
  transition,
  type FriendAction,
  type FriendRow,
  type FriendState,
} from "./friends";
import type { PublicPlayer } from "./protocol";

/* The database half of `friends.ts`. Every decision is made by the pure `transition`
   there; this only carries it out, which is why there is nothing to reason about here
   beyond who is who. */

export type Person = PublicPlayer & { id: string };

export type FriendList = {
  friends: Person[];
  /** Requests waiting on you. */
  incoming: Person[];
  /** Requests waiting on them. */
  outgoing: Person[];
  blocked: Person[];
  /** Pending games somebody has addressed to you by name. */
  challenges: { gameId: string; from: Person; initialMs: number; incrementMs: number }[];
};

async function rowFor(me: string, them: string): Promise<FriendRow | null> {
  const key = pairKey(me, them);
  const [row] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.aId, key.aId), eq(friendships.bId, key.bId)));
  return row ?? null;
}

export async function stateBetween(me: string, them: string): Promise<FriendState> {
  if (me === them) return "none";
  return friendshipState(await rowFor(me, them), me);
}

export async function byUsername(username: string): Promise<Person | null> {
  const [row] = await db
    .select()
    .from(players)
    // Usernames are unique and stored as Clerk has them, so this is an exact match.
    .where(eq(players.username, username));
  return row ? { id: row.clerkUserId, ...publicPlayer(row) } : null;
}

/** Everything the friends panel renders, in three queries. */
export async function friendList(me: string): Promise<FriendList> {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.aId, me), eq(friendships.bId, me)));

  const otherIds = rows.map((row) => (row.aId === me ? row.bId : row.aId));

  const [people, invited] = await Promise.all([
    otherIds.length
      ? db.select().from(players).where(inArray(players.clerkUserId, otherIds))
      : Promise.resolve([]),
    /* A challenge is a pending game with your name on it. No separate table and no
       notification to expire: Postgres holds it, so it is still there when you next
       load the page — an invite that waited. */
    db
      .select()
      .from(games)
      .where(and(eq(games.invitedId, me), eq(games.status, "pending"))),
  ]);

  const byId = new Map(
    people.map((row) => [row.clerkUserId, { id: row.clerkUserId, ...publicPlayer(row) }]),
  );

  const list: FriendList = {
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
    challenges: [],
  };

  for (const row of rows) {
    const person = byId.get(row.aId === me ? row.bId : row.aId);
    if (!person) continue;
    switch (friendshipState(row, me)) {
      case "friends":
        list.friends.push(person);
        break;
      case "incoming":
        list.incoming.push(person);
        break;
      case "outgoing":
        list.outgoing.push(person);
        break;
      case "blocked":
        list.blocked.push(person);
        break;
      default:
        // "blocked-by" is not shown: they blocked you, and telling you would defeat it.
        break;
    }
  }

  const challengerIds = invited.flatMap((game) =>
    [game.whiteId, game.blackId].filter((id): id is string => id !== null && id !== me),
  );
  const challengers = challengerIds.length
    ? await db.select().from(players).where(inArray(players.clerkUserId, challengerIds))
    : [];
  const challengerById = new Map(
    challengers.map((row) => [row.clerkUserId, { id: row.clerkUserId, ...publicPlayer(row) }]),
  );

  for (const game of invited) {
    const hostId = game.whiteId === me ? game.blackId : game.whiteId;
    const from = hostId ? challengerById.get(hostId) : null;
    if (!from) continue;
    list.challenges.push({
      gameId: game.id,
      from,
      initialMs: game.initialMs,
      incrementMs: game.incrementMs,
    });
  }

  list.friends.sort((a, b) => a.username.localeCompare(b.username));
  return list;
}

export type ActResult = { ok: true; state: FriendState } | { ok: false; reason: string };

/** Applies one action, having asked `transition` what it means. */
export async function act(
  me: string,
  them: string,
  action: FriendAction,
): Promise<ActResult> {
  if (me === them) return { ok: false, reason: "thats-you" };

  const key = pairKey(me, them);
  const current = friendshipState(await rowFor(me, them), me);
  const next = transition(current, action);

  if (next.effect === "refuse") return { ok: false, reason: next.reason };
  if (next.effect === "none") return { ok: true, state: current };

  if (next.effect === "delete") {
    await db
      .delete(friendships)
      .where(and(eq(friendships.aId, key.aId), eq(friendships.bId, key.bId)));
    return { ok: true, state: "none" };
  }

  const responded = next.status === "pending" ? null : new Date();
  await db
    .insert(friendships)
    .values({ ...key, status: next.status, actedBy: me, respondedAt: responded })
    .onConflictDoUpdate({
      target: [friendships.aId, friendships.bId],
      set: { status: next.status, actedBy: me, respondedAt: responded },
    });

  /* Read back rather than assumed. Two requests racing both compute "pending" from an
     empty row, and the second overwrites the first — so the row ends up attributed to
     whoever landed last, and the other one is looking at an incoming request instead of
     an outgoing one. That resolves in one click rather than deadlocking, but only if the
     caller is told what is actually stored rather than what it asked for. */
  return { ok: true, state: friendshipState(await rowFor(me, them), me) };
}
