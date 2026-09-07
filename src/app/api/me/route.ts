import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { games } from "@/lib/db/schema";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { isProvisional } from "@/lib/game/rating";

/** The signed-in player's chess record. Also the call that creates their row, so a
 *  visitor who signs in and never plays still exists by the time they queue. */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const completed = await db
    .select({ winner: games.winner, whiteId: games.whiteId })
    .from(games)
    .where(
      and(
        eq(games.status, "finished"),
        or(eq(games.whiteId, player.id), eq(games.blackId, player.id)),
      ),
    );
  const record = completed.reduce(
    (stats, game) => {
      if (game.winner === "draw") stats.draws += 1;
      else if ((game.winner === "white") === (game.whiteId === player.id)) stats.wins += 1;
      else stats.losses += 1;
      return stats;
    },
    { wins: 0, losses: 0, draws: 0 },
  );
  return NextResponse.json({
    username: player.username,
    rating: {
      value: Math.round(player.rating),
      provisional: isProvisional(player.rd),
    },
    record: { ...record, games: completed.length },
  });
}
