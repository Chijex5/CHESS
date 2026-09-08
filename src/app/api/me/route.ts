import { NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { isProvisional } from "@/lib/game/rating";

/** The signed-in player's identity and rating. Also the call that creates their row, so
 *  a visitor who signs in and never plays still exists by the time they queue — and the
 *  call the archive uses to find out whether there is a session at all.
 *
 *  Deliberately small. It used to scan every finished game to count a record the header
 *  never displayed; the record now comes from `statistics()` over the archive, which is
 *  the one place that arithmetic lives. */
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
