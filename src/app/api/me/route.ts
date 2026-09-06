import { NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { isProvisional } from "@/lib/game/rating";

/** The signed-in player's chess record. Also the call that creates their row, so a
 *  visitor who signs in and never plays still exists by the time they queue. */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  return NextResponse.json({
    username: player.username,
    rating: {
      value: Math.round(player.rating),
      provisional: isProvisional(player.rd),
    },
  });
}
