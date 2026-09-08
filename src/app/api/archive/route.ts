import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gameReviews, playedGames } from "@/lib/db/schema";
import { ensurePlayer } from "@/lib/multiplayer/players";
import {
  rowToSummary,
  summaryToRow,
  validSummary,
  type ArchiveBody,
} from "@/lib/archive/server";

/* ── The archive, server side ─────────────────────────────────────────────────
   Two things make this safe without much code. The owner is taken from the session
   and never from the body, so a player can only ever write their own history; and the
   write is an upsert keyed on (owner, game), so the two saves a finished game
   makes — one when it ends, one when the coach's notes land — are the same call
   twice rather than a duplicate row.
   ─────────────────────────────────────────────────────────────────────────── */

/** Saves or updates one finished game. */
export async function POST(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ArchiveBody | null;
  const summary = body?.summary;
  if (!summary || !validSummary(summary)) {
    return NextResponse.json({ error: "bad-summary" }, { status: 400 });
  }

  const row = summaryToRow(player.id, summary);
  await db
    .insert(playedGames)
    .values(row)
    .onConflictDoUpdate({
      target: [playedGames.ownerId, playedGames.gameId],
      /* The result never changes; the analysis is what arrives late. Writing the whole
         row would also work, but naming the columns says which ones a second save is
         expected to carry — and stops a re-analysis quietly rewriting who won. */
      set: {
        accuracy: row.accuracy,
        brilliants: row.brilliants,
        bests: row.bests,
        inaccuracies: row.inaccuracies,
        mistakes: row.mistakes,
        blunders: row.blunders,
        hinted: row.hinted,
        concepts: row.concepts,
      },
    });

  /* A null review means "no new analysis", not "delete it". The save at game over has
     nothing to store yet, and it must not wipe what a later pass wrote. */
  if (body?.review) {
    await db
      .insert(gameReviews)
      .values({
        ownerId: player.id,
        gameId: summary.id,
        payload: body.review,
        version: body.review.version,
      })
      .onConflictDoUpdate({
        target: [gameReviews.ownerId, gameReviews.gameId],
        set: { payload: body.review, version: body.review.version, createdAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
}

/** The player's finished games, newest first. */
export async function GET(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const asked = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), 500) : 200;

  const rows = await db
    .select()
    .from(playedGames)
    .where(eq(playedGames.ownerId, player.id))
    .orderBy(desc(playedGames.playedAt))
    .limit(limit);

  return NextResponse.json({ summaries: rows.map(rowToSummary) });
}
