import { NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { act, byUsername, friendList } from "@/lib/multiplayer/friends-db";

/** The whole friends panel: friends, both directions of pending, blocks, and any game
 *  somebody has addressed to you by name. */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  return NextResponse.json(await friendList(player.id));
}

/** Asks somebody, by username — the only handle a player knows another player by. */
export async function POST(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { username?: string } | null;
  const username = body?.username?.trim();
  if (!username) return NextResponse.json({ error: "bad-request" }, { status: 400 });

  const them = await byUsername(username);
  /* Deliberately the same answer as a name that exists but has blocked you — see
     `transition`. Distinguishing them would turn this route into a way to find out. */
  if (!them) return NextResponse.json({ error: "no-such-player" }, { status: 404 });

  const result = await act(player.id, them.id, "request");
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ state: result.state, player: them });
}
