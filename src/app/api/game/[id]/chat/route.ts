import { NextResponse } from "next/server";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { gameRow } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { RATE_LIMIT, chatOpen, cleanBody, withinRateLimit } from "@/lib/multiplayer/chat";
import { canInteract } from "@/lib/multiplayer/friends";
import { stateBetween } from "@/lib/multiplayer/friends-db";
import { publishChange } from "@/lib/realtime/bus";
import { REMATCH_WINDOW_MS, type Seat } from "@/lib/multiplayer/protocol";

/* ── Two people, one game ─────────────────────────────────────────────────────
   Reading is a delta from a cursor the snapshot advertises, which is the same
   relationship the board has to `moves.seq`: the stream says something changed, and
   the database says what. Writing is checked in the order the checks cost — seat,
   then whether chat is open at all, then the block, then the message, then the rate.
   ─────────────────────────────────────────────────────────────────────────── */

/** Who the requester is, and whether they belong here at all. */
async function seatIn(id: string) {
  const player = await ensurePlayer();
  if (!player) return { error: "sign-in-required", status: 401 } as const;

  const game = await gameRow(id);
  if (!game) return { error: "no-such-game", status: 404 } as const;

  const seat: Seat | null =
    game.whiteId === player.id ? "white" : game.blackId === player.id ? "black" : null;
  /* No spectator chat, because there are no spectators — and because a game between two
     people is not a room. */
  if (!seat) return { error: "not-a-player", status: 403 } as const;

  return { player, game, seat } as const;
}

/** Everything after `after`, which the client reads off the snapshot's `chatSeq`. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = normaliseGameId(raw);
  const found = await seatIn(id);
  if ("error" in found) {
    return NextResponse.json({ error: found.error }, { status: found.status });
  }

  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  const rows = await db
    .select()
    .from(messages)
    .where(
      Number.isFinite(after) && after > 0
        ? and(eq(messages.gameId, id), gt(messages.id, after))
        : eq(messages.gameId, id),
    )
    .orderBy(asc(messages.id))
    // A game's worth of conversation, capped so a long one cannot become a large read.
    .limit(200);

  return NextResponse.json({
    lines: rows.map((row) => ({
      id: row.id,
      seat: row.seat,
      body: row.body,
      at: row.sentAt.getTime(),
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = normaliseGameId(raw);
  const found = await seatIn(id);
  if ("error" in found) {
    return NextResponse.json({ error: found.error }, { status: found.status });
  }
  const { player, game, seat } = found;

  const now = Date.now();
  if (
    !chatOpen(
      { status: game.status, endedAt: game.endedAt?.getTime() ?? null },
      now,
      REMATCH_WINDOW_MS,
    )
  ) {
    return NextResponse.json({ error: "chat-closed" }, { status: 409 });
  }

  /* A block stops chat in both directions, whichever of them made it. Checked on the
     way in rather than filtered on the way out, so a blocked message is never stored. */
  const other = seat === "white" ? game.blackId : game.whiteId;
  if (other && !canInteract(await stateBetween(player.id, other))) {
    return NextResponse.json({ error: "not-available" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const cleaned = cleanBody(body?.body);
  if (!cleaned.ok) {
    return NextResponse.json({ error: cleaned.reason }, { status: 400 });
  }

  /* Counted from the stored rows rather than from Redis, so the limit holds in the
     degraded mode the rest of the realtime layer is designed to survive. */
  const recent = await db
    .select({ sentAt: messages.sentAt })
    .from(messages)
    .where(
      and(
        eq(messages.gameId, id),
        eq(messages.seat, seat),
        gt(messages.sentAt, new Date(now - RATE_LIMIT.windowMs)),
      ),
    );
  if (!withinRateLimit(recent.map((row) => row.sentAt.getTime()), now)) {
    return NextResponse.json({ error: "too-fast" }, { status: 429 });
  }

  const [written] = await db
    .insert(messages)
    .values({ gameId: id, seat, body: cleaned.body })
    .returning();

  // The doorbell. The snapshot's `chatSeq` moves, and the other client fetches the line.
  await publishChange(id, -4);
  return NextResponse.json({ id: written.id, body: cleaned.body });
}
