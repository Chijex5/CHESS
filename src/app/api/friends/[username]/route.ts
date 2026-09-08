import { NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { act, byUsername } from "@/lib/multiplayer/friends-db";
import type { FriendAction } from "@/lib/multiplayer/friends";

const ACTIONS: FriendAction[] = ["accept", "decline", "remove", "block", "unblock"];

/** Answering, ending, or blocking. `request` lives on the collection route, because it
 *  is the one action that creates the relationship rather than changing it. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action as FriendAction | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const { username } = await params;
  const them = await byUsername(decodeURIComponent(username));
  if (!them) return NextResponse.json({ error: "no-such-player" }, { status: 404 });

  const result = await act(player.id, them.id, action);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ state: result.state });
}
