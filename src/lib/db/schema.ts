import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ── The multiplayer schema ───────────────────────────────────────────────────
   Small on purpose. Single player keeps living in `localStorage` and needs none
   of this; the only reason a server exists is that a game against another person
   cannot be adjudicated by either person's browser.

   Two rules shape the tables. Moves are append-only and keyed by sequence, so a
   retrying client cannot play twice. And every clock reading is stored *with* the
   move that produced it, so remaining time is a fact in the log rather than a
   number the server has to keep re-deriving.
   ─────────────────────────────────────────────────────────────────────────── */

export const gameStatus = pgEnum("game_status", [
  /** Created, waiting for a second player to sit down. */
  "pending",
  "active",
  "finished",
  /** Nobody ever joined and the invite expired. */
  "abandoned",
]);

/** Why a game ended. Kept separate from who won: "black won by resignation" and
 *  "black won on time" are the same result and different stories. */
export const gameEnding = pgEnum("game_ending", [
  "checkmate",
  "resignation",
  "timeout",
  "stalemate",
  "insufficient-material",
  "threefold",
  "fifty-move",
  "agreement",
  "abandoned",
]);

export const gameWinner = pgEnum("game_winner", ["white", "black", "draw"]);

/** How much the engine is allowed to help. A column rather than a client setting:
 *  both players must be under the same rules, and neither may change them
 *  mid-game. Phase 2 only ever writes "none". */
export const assistance = pgEnum("assistance", ["none", "full"]);

export const players = pgTable(
  "players",
  {
    /** Clerk owns identity; this table owns everything chess-specific about a
     *  person. No email, no name — those stay in Clerk. */
    clerkUserId: text("clerk_user_id").primaryKey(),
    /** Denormalised from Clerk so listing a game does not need an API call per
     *  row. Refreshed whenever the player acts. */
    username: text("username").notNull(),
    /* Glicko-2. `rating` alone cannot say how sure we are, which is exactly what
       matchmaking needs to widen its window by — hence `rd`, the deviation, and
       `volatility`. Defaults are the reference implementation's. */
    rating: real("rating").notNull().default(1500),
    rd: real("rd").notNull().default(350),
    volatility: real("volatility").notNull().default(0.06),
    gamesPlayed: integer("games_played").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("players_username_idx").on(table.username)],
);

export const games = pgTable(
  "games",
  {
    /** Short, URL-safe, generated in the app rather than a serial: the id is the
     *  invite link, so it must not be guessable by counting. */
    id: text("id").primaryKey(),
    whiteId: text("white_id").references(() => players.clerkUserId),
    blackId: text("black_id").references(() => players.clerkUserId),
    status: gameStatus("status").notNull().default("pending"),
    winner: gameWinner("winner"),
    ending: gameEnding("ending"),
    /** Starting time per side, ms. 0 means no clock. */
    initialMs: integer("initial_ms").notNull(),
    incrementMs: integer("increment_ms").notNull().default(0),
    assistance: assistance("assistance").notNull().default("none"),
    /** True when the pair came out of the matchmaking queue rather than a link.
     *  Only these affect rating — a game against a friend you invited is not
     *  evidence about your strength. */
    rated: integer("rated").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /* What the game did to each rating, written when it ends. Stored rather than
       derived because the "before" value is overwritten the instant the update lands,
       and a player who reloads the result should still see what they gained. */
    whiteRatingBefore: integer("white_rating_before"),
    whiteRatingAfter: integer("white_rating_after"),
    blackRatingBefore: integer("black_rating_before"),
    blackRatingAfter: integer("black_rating_after"),
    /* The game these two agreed to play next, set when a rematch is accepted.
       A forward pointer on the *finished* game rather than a "rematch of" pointer on
       the new one, because of who needs to read it: both players are still looking at
       the game that just ended, and this is how the one who offered learns where to
       go. Reading it costs nothing — the row is already loaded — where a backward
       pointer would mean a second query on every snapshot.

       It also settles the race. Two accepts (a double click, or both players offering
       and accepting at once) must not create two games, and a conditional update on
       `rematch_id IS NULL` decides that in one statement. */
    rematchId: text("rematch_id").references((): AnyPgColumn => games.id),
  },
  (table) => [
    index("games_white_idx").on(table.whiteId, table.createdAt),
    index("games_black_idx").on(table.blackId, table.createdAt),
    index("games_status_idx").on(table.status),
  ],
);

export const moves = pgTable(
  "moves",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    /** 1-based ply. Half of the primary key, which is what makes a duplicate
     *  submission a constraint violation instead of a second move. */
    seq: integer("seq").notNull(),
    san: text("san").notNull(),
    uci: text("uci").notNull(),
    /** Stored rather than replayed on read: the client needs a position to draw
     *  before it needs a move list to verify. */
    fenAfter: text("fen_after").notNull(),
    /** Both clocks as of this move. Storing the pair means the whole clock history
     *  is auditable and a reconnecting client needs one row, not arithmetic over
     *  every row before it. */
    msLeftWhite: integer("ms_left_white").notNull(),
    msLeftBlack: integer("ms_left_black").notNull(),
    /* Milliseconds since the epoch, from the server. A timestamp column would do,
       but every consumer wants a number to subtract. */
    playedAt: bigint("played_at", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.seq] })],
);

export const invites = pgTable(
  "invites",
  {
    code: text("code").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => players.clerkUserId),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (table) => [index("invites_game_idx").on(table.gameId)],
);

/** An offer one player has made and the other has not yet answered. One row per
 *  game at most — a second offer replaces the first, which is why the game id is
 *  the key rather than a serial. */
export const offers = pgTable("offers", {
  gameId: text("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["draw", "rematch"] }).notNull(),
  offeredBy: text("offered_by").notNull(),
  offeredAt: timestamp("offered_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Move = typeof moves.$inferSelect;
