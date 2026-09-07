import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { games } from "@/lib/db/schema";
import { isProvisional } from "@/lib/game/rating";
import { myGames } from "@/lib/multiplayer/games";
import { ensurePlayer, playerById } from "@/lib/multiplayer/players";

/** Profile-only data. `/api/me` stays small because the header calls it frequently. */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  const [completed, recent] = await Promise.all([
    db.select({ winner: games.winner, whiteId: games.whiteId }).from(games).where(and(
      eq(games.status, "finished"),
      or(eq(games.whiteId, player.id), eq(games.blackId, player.id)),
    )),
    myGames(player.id),
  ]);
  const record = completed.reduce((stats, game) => {
    if (game.winner === "draw") stats.draws += 1;
    else if ((game.winner === "white") === (game.whiteId === player.id)) stats.wins += 1;
    else stats.losses += 1;
    return stats;
  }, { wins: 0, losses: 0, draws: 0 });
  const history = await Promise.all(recent.map(async (game) => {
    const other = await playerById(game.whiteId === player.id ? game.blackId : game.whiteId);
    const won = (game.winner === "white") === (game.whiteId === player.id);
    return {
      id: game.id,
      opponent: other?.username ?? "Waiting for opponent",
      outcome: game.status !== "finished" ? game.status : game.winner === "draw" ? "Draw" : won ? "Won" : "Lost",
      playedAt: (game.endedAt ?? game.createdAt).toISOString(),
    };
  }));
  return NextResponse.json({
    username: player.username,
    rating: { value: Math.round(player.rating), provisional: isProvisional(player.rd) },
    record: { ...record, games: completed.length },
    history,
  });
}
