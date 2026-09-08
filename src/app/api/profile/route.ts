import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games } from "@/lib/db/schema";
import { isProvisional } from "@/lib/game/rating";
import { ensurePlayer } from "@/lib/multiplayer/players";

/**
 * The two things the profile page cannot work out for itself.
 *
 * Everything else on that page — the record, the splits, the accuracy trend, the
 * weaknesses — is `statistics()` over the archive, which runs client-side so that it
 * behaves identically for a signed-in player reading Postgres and a signed-out one
 * reading IndexedDB. What the client cannot derive is the rating curve: your own rating
 * after each rated game is a fact only the games table has, and it is deliberately not
 * copied onto the archive rows, because a rating is a property of you over time rather
 * than of any one game.
 */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) return NextResponse.json({ error: "sign-in-required" }, { status: 401 });

  const rows = await db
    .select({
      endedAt: games.endedAt,
      whiteId: games.whiteId,
      whiteAfter: games.whiteRatingAfter,
      blackAfter: games.blackRatingAfter,
    })
    .from(games)
    .where(
      and(
        eq(games.status, "finished"),
        eq(games.rated, 1),
        isNotNull(games.endedAt),
        // Only games whose ratings were actually applied have a point to plot.
        isNotNull(games.whiteRatingAfter),
        or(eq(games.whiteId, player.id), eq(games.blackId, player.id)),
      ),
    )
    .orderBy(asc(games.endedAt));

  const curve = rows.flatMap((row) => {
    const rating = row.whiteId === player.id ? row.whiteAfter : row.blackAfter;
    if (rating === null || !row.endedAt) return [];
    return [{ at: row.endedAt.getTime(), rating }];
  });

  return NextResponse.json({
    username: player.username,
    rating: { value: Math.round(player.rating), provisional: isProvisional(player.rd) },
    curve,
  });
}
