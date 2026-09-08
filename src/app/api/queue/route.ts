import { NextResponse } from "next/server";
import { createPairedGame } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import {
  claimMatch,
  dequeue,
  enqueue,
  publishMatch,
  queueDepth,
  tryPair,
} from "@/lib/multiplayer/queue";
import { timeControlFor, type TimeControlId } from "@/lib/game/time-controls";

/* No background worker: pairing happens on the request of whoever just arrived or just
   polled. That is the person who most wants a match, there is nothing to schedule, and
   a queue nobody is asking about does not need to be worked. */

type Body = { timeControl?: TimeControlId };

/** Joins the queue, or heartbeats an existing entry, and pairs if it can. */
export async function POST(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const controlId = body.timeControl ?? "rapid10";
  const control = timeControlFor(controlId);
  if (control.initialMs === 0) {
    return NextResponse.json({ error: "clock-required" }, { status: 400 });
  }

  /* Collected before anything else: if another player's request paired us while this
     one was in flight, we are already in a game and must not rejoin the queue. */
  const already = await claimMatch(player.id);
  if (already) return NextResponse.json({ status: "matched", gameId: already });

  const joined = await enqueue({
    control: controlId,
    userId: player.id,
    rating: player.rating,
    rd: player.rd,
  });
  if (!joined) {
    return NextResponse.json({ error: "queue-unavailable" }, { status: 503 });
  }

  const pair = await tryPair({
    control: controlId,
    userId: player.id,
    rating: player.rating,
    rd: player.rd,
  });

  if (!pair) {
    return NextResponse.json({
      status: "waiting",
      waiting: await queueDepth(controlId),
    });
  }

  /* Colours by coin flip. Alternating by rating or by who waited longer would be a
     small, permanent advantage handed to one of them. */
  const whiteFirst = Math.random() < 0.5;
  const gameId = await createPairedGame({
    white: whiteFirst ? pair.a : pair.b,
    black: whiteFirst ? pair.b : pair.a,
    initialMs: control.initialMs,
    incrementMs: control.incrementMs,
    // A stranger paired on rating is the only evidence about strength we collect.
    rated: true,
  });

  /* The other player learns about it by polling; ours is collected here rather than
     left for a poll we might not make. */
  await publishMatch(pair.a === player.id ? pair.b : pair.a, gameId);

  return NextResponse.json({ status: "matched", gameId });
}

/** Leaves the queue. */
export async function DELETE(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const controlId = (url.searchParams.get("timeControl") ?? "rapid10") as TimeControlId;
  await dequeue(controlId, player.id);
  return NextResponse.json({ status: "left" });
}

/** Polls for a pairing without rejoining, for a client that has been matched by
 *  somebody else's request. */
export async function GET(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const url = new URL(request.url);
  const controlId = (url.searchParams.get("timeControl") ?? "rapid10") as TimeControlId;
  const gameId = await claimMatch(player.id);
  if (gameId) return NextResponse.json({ status: "matched", gameId });
  return NextResponse.json({ status: "waiting", waiting: await queueDepth(controlId) });
}
