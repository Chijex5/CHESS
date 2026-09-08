import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gameReviews, playedGames } from "@/lib/db/schema";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { readableReview } from "@/lib/archive/server";

/** One stored analysis. Tens of kilobytes, which is why it is a separate request from
 *  the summary list rather than part of it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const { id } = await params;

  /* Owner in the WHERE rather than a check afterwards: the id of somebody else's game
     is not a secret — it is in a URL they may have shared — so the only thing keeping
     their analysis private is that this query cannot reach it. */
  const [row] = await db
    .select()
    .from(gameReviews)
    .where(and(eq(gameReviews.ownerId, player.id), eq(gameReviews.gameId, id)));

  if (!row) return NextResponse.json({ review: null });
  return NextResponse.json({ review: readableReview(row.payload, row.version) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const { id } = await params;

  await Promise.all([
    db
      .delete(playedGames)
      .where(and(eq(playedGames.ownerId, player.id), eq(playedGames.gameId, id))),
    db
      .delete(gameReviews)
      .where(and(eq(gameReviews.ownerId, player.id), eq(gameReviews.gameId, id))),
  ]);
  return NextResponse.json({ ok: true });
}
