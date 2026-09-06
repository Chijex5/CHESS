import "server-only";
import { eq } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import { isProvisional } from "@/lib/game/rating";
import type { PublicPlayer } from "./protocol";

/* Clerk owns identity; this table owns everything chess-specific. The row is
   created on first contact rather than by a webhook: a webhook is another moving
   part that can be down when someone signs up, and the first thing any online
   player does is hit a route that needs their rating anyway. */
export async function ensurePlayer(): Promise<{
  id: string;
  username: string;
  rating: number;
  rd: number;
  volatility: number;
} | null> {
  const user = await currentUser();
  if (!user) return null;

  /* Usernames are required on this instance, but an OAuth sign-up sets one a step
     after the session exists — so this can genuinely be null for a moment, and a
     row with a null username would violate the column. */
  const username = user.username;
  if (!username) return null;

  const [row] = await db
    .insert(players)
    .values({ clerkUserId: user.id, username })
    .onConflictDoUpdate({
      target: players.clerkUserId,
      // Keeps the denormalised copy honest if they rename themselves in Clerk.
      set: { username, lastSeenAt: new Date() },
    })
    .returning();

  return {
    id: row.clerkUserId,
    username: row.username,
    rating: row.rating,
    rd: row.rd,
    volatility: row.volatility,
  };
}

export async function playerById(id: string | null): Promise<PublicPlayer | null> {
  if (!id) return null;
  const [row] = await db.select().from(players).where(eq(players.clerkUserId, id));
  return row ? publicPlayer(row) : null;
}

export function publicPlayer(row: {
  username: string;
  rating: number;
  rd: number;
}): PublicPlayer {
  return {
    username: row.username,
    rating: Math.round(row.rating),
    provisional: isProvisional(row.rd),
  };
}
