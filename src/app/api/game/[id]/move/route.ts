import { NextResponse } from "next/server";
import { submitMove } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import type { MoveRequest } from "@/lib/multiplayer/protocol";

/**
 * Plays one move.
 *
 * Nothing about the position is taken from the request: the server replays its own
 * log, so `from`, `to`, `promotion` and the claimed sequence are the only inputs,
 * and every one of them is checked. A client that lies gets a 409 and a snapshot to
 * correct itself from.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as MoveRequest | null;
  if (!body?.from || !body?.to || typeof body.seq !== "number") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const result = await submitMove(normaliseGameId(id), player.id, {
    from: body.from,
    to: body.to,
    promotion: body.promotion,
    seq: body.seq,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ seq: result.seq, san: result.san });
}
