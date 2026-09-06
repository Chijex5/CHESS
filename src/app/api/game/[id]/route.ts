import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { joinGame, snapshot } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { normaliseGameId } from "@/lib/multiplayer/ids";

/** The whole game, cold. A client draws from this and then keeps up over SSE. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await auth();
  const state = await snapshot(normaliseGameId(id), userId ?? null);
  if (!state) return NextResponse.json({ error: "no-such-game" }, { status: 404 });
  return NextResponse.json(state);
}

/**
 * Sits down at a pending game — the second half of an invite link.
 *
 * A POST rather than a side effect of the GET above, so that merely looking at a
 * link does not consume it: a player who opens a friend's invite to see the time
 * control and closes it again has not taken the seat.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const gameId = normaliseGameId(id);
  const seated = await joinGame(gameId, player.id);
  if (!seated) {
    // Either the game is full, already finished, or does not exist. The snapshot
    // says which, and the client needs it regardless.
    const state = await snapshot(gameId, player.id);
    if (!state) return NextResponse.json({ error: "no-such-game" }, { status: 404 });
    return NextResponse.json(state, { status: state.seat ? 200 : 409 });
  }

  const state = await snapshot(gameId, player.id);
  return NextResponse.json(state);
}
