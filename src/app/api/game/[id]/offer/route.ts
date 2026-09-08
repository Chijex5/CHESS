import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { offers } from "@/lib/db/schema";
import {
  acceptRematch,
  declineRematch,
  finish,
  gameRow,
  moveRowsForGame,
  offerRematch,
} from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { replay, resignResult } from "@/lib/multiplayer/rules";
import { publishChange } from "@/lib/realtime/bus";
import type { Seat } from "@/lib/multiplayer/protocol";

/** Everything either player can propose, and the state each proposal requires. */
const ACTIONS = {
  resign: "active",
  "offer-draw": "active",
  "accept-draw": "active",
  "decline-draw": "active",
  /* A rematch is the mirror image: it only exists once the game is over, which is why
     this route can no longer have one status check at the top. */
  "offer-rematch": "finished",
  "accept-rematch": "finished",
  "decline-rematch": "finished",
} as const;

type Action = keyof typeof ACTIONS;
type Body = { action?: Action };

const isAction = (value: unknown): value is Action =>
  typeof value === "string" && value in ACTIONS;

/**
 * Everything that ends a game, offers to end it, or asks for another one.
 *
 * One route rather than seven, because they share every check — who you are, which
 * seat, whether the game is in the right state — and differ only in the last step. The
 * ones that need two people to agree are rows rather than messages, so an offer
 * survives the offerer closing their tab.
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

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!isAction(body?.action)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const action = body.action;

  const game = await gameRow(id);
  if (!game) return NextResponse.json({ error: "no-such-game" }, { status: 404 });
  if (game.status !== ACTIONS[action]) {
    return NextResponse.json(
      { error: ACTIONS[action] === "active" ? "game-not-active" : "game-not-finished" },
      { status: 409 },
    );
  }

  const seat: Seat | null =
    game.whiteId === player.id ? "white" : game.blackId === player.id ? "black" : null;
  if (!seat) return NextResponse.json({ error: "not-a-player" }, { status: 403 });

  switch (action) {
    case "resign": {
      const result = resignResult(seat);
      await finish(id, result.winner, result.ending);
      return NextResponse.json({ ok: true });
    }

    case "offer-draw": {
      if (game.engineElo !== null) {
        /* The silent opponent accepts only positions the player is materially ahead
           in. It otherwise declines by clearing the proposal — no fake chat reply. */
        const board = replay((await moveRowsForGame(id)).map((move) => move.san)).board;
        const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        const edge = board.board().flat().reduce((sum, piece) => sum + (piece ? (piece.color === (seat === "white" ? "w" : "b") ? values[piece.type] : -values[piece.type]) : 0), 0);
        if (edge > 0) await finish(id, "draw", "agreement");
        else await publishChange(id, -2);
        return NextResponse.json({ ok: true });
      }
      /* Keyed by game, so offering twice replaces rather than accumulates and there
         is never a queue of stale offers to reason about. */
      await db
        .insert(offers)
        .values({ gameId: id, kind: "draw", offeredBy: seat })
        .onConflictDoUpdate({
          target: offers.gameId,
          set: { kind: "draw", offeredBy: seat, offeredAt: new Date() },
        });
      await publishChange(id, -2);
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

    /* The rematch trio all resolve to the same answer — where to go, or nothing yet —
       so the caller has one field to read whichever it sent. The seat and status checks
       above are repeated inside, because these are also the functions the rest of the
       server calls and they must not depend on a route having gone first. */
    case "offer-rematch":
    case "accept-rematch":
    case "decline-rematch": {
      const run =
        action === "offer-rematch"
          ? offerRematch
          : action === "accept-rematch"
            ? acceptRematch
            : declineRematch;
      const result = await run(id, player.id);
      if (!result.ok) {
        return NextResponse.json({ error: result.reason }, { status: result.status });
      }
      return NextResponse.json({ ok: true, rematchId: result.rematchId });
    }
  }
}
