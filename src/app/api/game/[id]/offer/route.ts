import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { offers } from "@/lib/db/schema";
import { finish, gameRow } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { resignResult } from "@/lib/multiplayer/rules";
import { publishChange } from "@/lib/realtime/bus";
import type { Seat } from "@/lib/multiplayer/protocol";

type Body = {
  action: "resign" | "offer-draw" | "accept-draw" | "decline-draw";
};

/**
 * Everything that ends or offers to end a game.
 *
 * One route rather than four, because they share every check — who you are, which
 * seat, whether the game is still live — and differ only in the last step. A draw is
 * the only one that needs two people to agree, which is why offers are a row rather
 * than a message: an offer has to survive the offerer closing their tab.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = normaliseGameId(raw);

  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const game = await gameRow(id);
  if (!game) return NextResponse.json({ error: "no-such-game" }, { status: 404 });
  if (game.status !== "active") {
    return NextResponse.json({ error: "game-not-active" }, { status: 409 });
  }

  const seat: Seat | null =
    game.whiteId === player.id ? "white" : game.blackId === player.id ? "black" : null;
  if (!seat) return NextResponse.json({ error: "not-a-player" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Body | null;

  switch (body?.action) {
    case "resign": {
      const result = resignResult(seat);
      await finish(id, result.winner, result.ending);
      return NextResponse.json({ ok: true });
    }

    case "offer-draw": {
      /* Keyed by game, so offering twice replaces rather than accumulates and there
         is never a queue of stale offers to reason about. */
      await db
        .insert(offers)
        .values({ gameId: id, kind: "draw", offeredBy: seat })
        .onConflictDoUpdate({
          target: offers.gameId,
          set: { kind: "draw", offeredBy: seat, offeredAt: new Date() },
        });
      await publishChange(id, game.status === "active" ? -2 : -1);
      return NextResponse.json({ ok: true });
    }

    case "accept-draw": {
      const [open] = await db.select().from(offers).where(eq(offers.gameId, id));
      // You cannot accept your own offer, and there has to be one to accept.
      if (!open || open.kind !== "draw" || open.offeredBy === seat) {
        return NextResponse.json({ error: "no-offer" }, { status: 409 });
      }
      await finish(id, "draw", "agreement");
      return NextResponse.json({ ok: true });
    }

    case "decline-draw": {
      await db.delete(offers).where(eq(offers.gameId, id));
      await publishChange(id, -2);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
}
