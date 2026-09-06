import { NextResponse } from "next/server";
import { createGame, myGames } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { timeControlFor, type TimeControlId } from "@/lib/game/time-controls";
import type { Seat } from "@/lib/multiplayer/protocol";

type Body = {
  side?: Seat | "random";
  timeControl?: TimeControlId;
};

/** Creates a game and returns its id, which is also its invite link. */
export async function POST(request: Request) {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const control = timeControlFor(body.timeControl ?? "rapid10");

  /* An untimed game between two people has no way to end when one of them walks
     away, and no clock means no flag-fall, which is the only mechanism that
     resolves an abandoned game. So online games always have a clock, and the
     shortest offered is the floor. */
  const initialMs = control.initialMs > 0 ? control.initialMs : 600_000;

  const id = await createGame({
    createdBy: player.id,
    side: body.side ?? "random",
    initialMs,
    incrementMs: control.incrementMs,
    // A game you invited a specific person to is not evidence about your strength.
    rated: false,
  });

  return NextResponse.json({ id });
}

/** The player's own games, for a "resume" list. */
export async function GET() {
  const player = await ensurePlayer();
  if (!player) {
    return NextResponse.json({ error: "sign-in-required" }, { status: 401 });
  }
  const rows = await myGames(player.id);
  return NextResponse.json({
    games: rows.map((row) => ({
      id: row.id,
      status: row.status,
      winner: row.winner,
      seat: row.whiteId === player.id ? "white" : "black",
      createdAt: row.createdAt,
    })),
  });
}
