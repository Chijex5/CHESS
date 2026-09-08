import { NextResponse } from "next/server";
import { submitEngineMove } from "@/lib/multiplayer/games";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { ensurePlayer } from "@/lib/multiplayer/players";
import type { MoveRequest } from "@/lib/multiplayer/protocol";

/** Receives the browser worker's move for a queue fallback. The server still replays
 * and validates it; this route only permits the real participant to advance its bot. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const player = await ensurePlayer();
  if (!player) return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as MoveRequest | null;
  if (!body?.from || !body.to || typeof body.seq !== "number") {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const { id } = await params;
  const result = await submitEngineMove(normaliseGameId(id), player.id, body);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ seq: result.seq, san: result.san });
}
