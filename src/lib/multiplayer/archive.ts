import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { moves, playedGames, players } from "@/lib/db/schema";
import type { Game } from "@/lib/db/schema";
import type { GameEnding, GameWinner, Seat } from "./protocol";

/* ── Filing a finished online game ────────────────────────────────────────────
   Written by the server, at the moment the result is recorded, and deliberately not
   left to the client. Two reasons.

   The facts are the server's: who you played, what they were rated at the time, what
   clock you were on, whether it counted. A client could be told all of that and then
   assert it back, but then a client that never opened the analysis page — which is
   most of them, most of the time — would have no history at all.

   So the row lands here with the analysis columns null, meaning "not analysed", and
   `/api/archive` upserts them later if and when the player runs the engine over it.
   ─────────────────────────────────────────────────────────────────────────── */

const outcomeFor = (winner: GameWinner, seat: Seat) =>
  winner === "draw" ? "draw" : winner === seat ? "win" : "loss";

export async function archiveFinished(
  game: Game,
  winner: GameWinner,
  ending: GameEnding,
  /** Pre-game ratings, when the game was rated. Passed in rather than read back off
   *  the row: `finish` applies the update in the same call, and by the time this runs
   *  the "before" value on the row may or may not have been written yet depending on
   *  which statement won. The caller has the number for certain. */
  ratings: Record<Seat, { before: number; after: number }> | null,
): Promise<void> {
  // A game only one person ever sat down in has no opponent to name.
  if (!game.whiteId || !game.blackId) return;

  const [rows, roster] = await Promise.all([
    db
      .select({ san: moves.san })
      .from(moves)
      .where(eq(moves.gameId, game.id))
      .orderBy(asc(moves.seq)),
    db
      .select()
      .from(players)
      .where(inArray(players.clerkUserId, [game.whiteId, game.blackId])),
  ]);

  const byId = new Map(roster.map((row) => [row.clerkUserId, row]));
  const white = byId.get(game.whiteId);
  const black = byId.get(game.blackId);
  if (!white || !black) return;

  const firstMoves = rows.slice(0, 3).map((row) => row.san).join(" ");
  const playedAt = game.endedAt ?? new Date();

  const seats: { seat: Seat; ownerId: string; opponent: typeof white }[] = [
    { seat: "white", ownerId: game.whiteId, opponent: black },
    { seat: "black", ownerId: game.blackId, opponent: white },
  ];

  /* One row per player, each phrased from their own chair. Storing it once with a
     winner would push "which side was I?" into every aggregate that ever reads it. */
  await Promise.all(
    seats.map(({ seat, ownerId, opponent }) =>
      db
        .insert(playedGames)
        .values({
          ownerId,
          gameId: game.id,
          source: "online",
          side: seat,
          opponent: opponent.username,
          /* What they were rated *before* this game — what you actually played
             against, rather than what beating them left them on. */
          opponentRating: Math.round(
            ratings?.[seat === "white" ? "black" : "white"].before ?? opponent.rating,
          ),
          outcome: outcomeFor(winner, seat),
          ending,
          moveCount: rows.length,
          firstMoves,
          initialMs: game.initialMs,
          incrementMs: game.incrementMs,
          rated: game.rated,
          playedAt,
        })
        /* Nothing here changes on a second call, and `finish` is already guarded
           against running twice — but a rematch chain and a lazily settled flag both
           make this reachable from more than one request, and a conflict must not
           throw back into the path that just recorded the result. */
        .onConflictDoNothing({
          target: [playedGames.ownerId, playedGames.gameId],
        }),
    ),
  );
}
