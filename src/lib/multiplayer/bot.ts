import type { PublicPlayer } from "./protocol";

/* ── The house account ────────────────────────────────────────────────────────
   A queue that finds nobody hands you the engine wearing a human-looking name. That
   name is display text, and it needs to stay display text.

   The first version gave every fallback game its own `players` row — a fresh
   `engine:<gameId>` with a random username. Three things followed from that, all bad,
   and all because `players.username` is UNIQUE:

     · two fallback games rolling the same name made the insert throw, and the queue
       route had already dequeued the player, so they got a 500 and no game. Five base
       names and three digits is 4,500 combinations, which is even odds of a collision
       by the seventy-ninth fallback game
     · a human registering `NorthStar314` in Clerk broke *their own* account
       permanently: `ensurePlayer`'s upsert is keyed on the primary key, so a username
       conflict is unhandled and every online route 500s for them
     · the rows are in `players`, so `byUsername` found them and a person could send a
       friend request to a bot

   So there is now exactly one row, shared by every fallback game, and the per-game
   name lives on `games.bot_name` where it is a label rather than a key. One username
   to reserve instead of 4,500 — and it is reserved the only way Clerk allows, by
   occupying it, since Clerk's block-list takes emails, phone numbers and web3 wallets
   and has no notion of a reserved username.
   ─────────────────────────────────────────────────────────────────────────── */

/** Not a Clerk id, and cannot be mistaken for one: Clerk's are `user_…`. */
export const HOUSE_ID = "engine:house";

/** Held by a real Clerk user so that no person can register it. Never displayed —
 *  players see `games.bot_name` — so it is chosen to read as plumbing. */
export const HOUSE_USERNAME = "engine";

/** Deliberately ordinary. A fallback opponent that announced itself would turn "no one
 *  was available" into "we could not find you a game", which is worse and no truer. */
const BOT_NAMES = [
  "RiverKnight",
  "QuietBishop",
  "SilverPawn",
  "NorthStar",
  "AmberRook",
  "PaleGambit",
  "SlateCastle",
  "HollowFile",
];

/** A per-game label. Collisions are now free — two games may show the same name for
 *  the same reason two people may share a first name. */
export function botDisplayName(): string {
  const stem = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  return `${stem}${Math.floor(100 + Math.random() * 900)}`;
}

/** Whether a seat is the engine's. One comparison, and no `startsWith` guessing. */
export function isHouse(id: string | null): boolean {
  return id === HOUSE_ID;
}

/**
 * The opponent as the board should draw it.
 *
 * Rating comes off the game rather than off the shared row, which is the whole reason
 * a shared row works: the engine's strength is a property of the game it was set for,
 * and `games.engine_elo` already records it. Marked provisional so the number is never
 * printed as a settled rating — it is a difficulty setting, not a history.
 */
export function housePlayer(game: {
  botName: string | null;
  engineElo: number | null;
}): PublicPlayer {
  return {
    username: game.botName ?? "Opponent",
    rating: game.engineElo ?? 1500,
    provisional: true,
  };
}
