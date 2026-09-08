import { NextResponse } from "next/server";
import { createGame, myGames } from "@/lib/multiplayer/games";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { byUsername, stateBetween } from "@/lib/multiplayer/friends-db";
import { canInteract } from "@/lib/multiplayer/friends";
import { timeControlFor, type TimeControlId } from "@/lib/game/time-controls";
import type { Seat } from "@/lib/multiplayer/protocol";

type Body = {
  side?: Seat | "random";
  timeControl?: TimeControlId;
  /** Addresses the game to one player, by username. */
  invite?: string;
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

  /* A challenge to a named player. Resolved and permission-checked here rather than at
     join time, so somebody who has blocked you never receives the invitation at all —
     and so a typo in a username fails now, while you are still looking at the form. */
  let invitedId: string | null = null;
  if (body.invite) {
    const them = await byUsername(body.invite.trim());
    if (!them) return NextResponse.json({ error: "no-such-player" }, { status: 404 });
    if (them.id === player.id) return NextResponse.json({ error: "thats-you" }, { status: 400 });
    if (!canInteract(await stateBetween(player.id, them.id))) {
      // The same answer either direction of a block, which is the point of it.
      return NextResponse.json({ error: "not-available" }, { status: 403 });
    }
    invitedId = them.id;
  }

  const id = await createGame({
    createdBy: player.id,
    side: body.side ?? "random",
    initialMs,
    incrementMs: control.incrementMs,
    // A game you invited a specific person to is not evidence about your strength.
    rated: false,
    invitedId,
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
