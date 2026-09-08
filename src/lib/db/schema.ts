import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
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
    /** A queue fallback is played by the browser's Stockfish worker, while retaining
     * the online board and archive shape. Its strength is game metadata, not
     * a rating result against a fabricated account. */
    engineElo: integer("engine_elo"),
    /** The human-looking name shown for an engine fallback opponent. Display text, and
     *  deliberately *not* unique: it used to be a `players.username`, which is, and two
     *  games rolling the same name threw on the insert. Nothing is keyed on this. */
    botName: text("bot_name"),
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
    /** Set when this game is a challenge to one named person rather than an open
     *  link. `joinGame` refuses the seat to anybody else, which is the whole
     *  difference between "here is a link" and "I am asking you". */
    invitedId: text("invited_id").references(() => players.clerkUserId),
  },
  (table) => [
    index("games_white_idx").on(table.whiteId, table.createdAt),
    index("games_black_idx").on(table.blackId, table.createdAt),
    index("games_status_idx").on(table.status),
    index("games_invited_idx").on(table.invitedId, table.status),
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

/* ── The archive ──────────────────────────────────────────────────────────────
   `games` is the write model: it adjudicates one live game, and every column on it
   exists so the server can decide something. `played_games` is the read model for
   looking *back* over many, and the two are deliberately separate.

   That means an online game is written to both, which is duplication with a reason.
   A history list and a statistics page have to treat a game against Stockfish and a
   game against a person as the same kind of thing — same accuracy figure, same
   weakness tally, same row in the same table — and an engine game has no `games` row
   at all, because it was never adjudicated by anyone. One shape for both is what
   makes the archive a single interface rather than a union of two queries.
   ─────────────────────────────────────────────────────────────────────────── */

export const gameSource = pgEnum("game_source", ["engine", "online"]);
export const gameOutcome = pgEnum("game_outcome", ["win", "loss", "draw"]);

/** One finished game, from one player's point of view.
 *
 *  Keyed by (owner, game) rather than by game: both sides of an online game get a
 *  row, and each says "win" or "loss" from where they were sitting. Storing it once
 *  with a winner would mean every read had to work out which chair the reader was in,
 *  in every aggregate, forever. */
export const playedGames = pgTable(
  "played_games",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => players.clerkUserId, { onDelete: "cascade" }),
    /** The server's id for an online game; a client-generated one for an engine
     *  game, which no server ever saw. */
    gameId: text("game_id").notNull(),
    source: gameSource("source").notNull(),
    side: text("side", { enum: ["white", "black"] }).notNull(),
    /** Who you played, as it should be printed: a username, or "Karpov · 1600" for
     *  one of the named engine opponents. Denormalised because a history row must
     *  still read correctly after they rename themselves. */
    opponent: text("opponent").notNull(),
    opponentRating: integer("opponent_rating"),
    outcome: gameOutcome("outcome").notNull(),
    ending: gameEnding("ending"),
    moveCount: integer("move_count").notNull(),
    /** The first three plies, space-separated SAN. Enough to say what you open with
     *  and how it goes, without an opening book. */
    firstMoves: text("first_moves").notNull().default(""),
    initialMs: integer("initial_ms").notNull().default(0),
    incrementMs: integer("increment_ms").notNull().default(0),
    rated: integer("rated").notNull().default(0),
    /* Everything below arrives later than the row does. The server writes an online
       game's result the moment it ends and cannot know the accuracy, because nothing
       has been searched yet — the client analyses the finished move list afterwards
       and upserts these in. Null therefore means "not analysed", which is a real and
       common state, not a missing value. */
    accuracy: real("accuracy"),
    brilliants: integer("brilliants"),
    bests: integer("bests"),
    inaccuracies: integer("inaccuracies"),
    mistakes: integer("mistakes"),
    blunders: integer("blunders"),
    hinted: integer("hinted"),
    /** Concept slug → how many of your own mistakes the coach cited it against. The
     *  one statistic this whole application exists to produce. */
    concepts: jsonb("concepts").$type<Record<string, number>>(),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.gameId] }),
    index("played_owner_idx").on(table.ownerId, table.playedAt),
  ],
);

/** The analysis itself: plies, every position's evaluation, and the coach's notes.
 *
 *  A separate table because of how differently the two are read. A statistics page
 *  scans every row a player owns; this is tens of kilobytes each and is wanted one at
 *  a time, when somebody opens a review. Keeping it out of `played_games` is the
 *  difference between a stats query reading a few kilobytes and reading megabytes. */
export const gameReviews = pgTable(
  "game_reviews",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => players.clerkUserId, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    /** The working set as the three client stores hold it. Opaque here on purpose:
     *  the server never reads inside it, so its shape is versioned by the client
     *  rather than by a migration. */
    payload: jsonb("payload").notNull(),
    /** Shape of `payload`, so a client meeting an older row can decide whether to
     *  restore it or re-analyse the game from scratch. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.gameId] })],
);

/* ── Friends ──────────────────────────────────────────────────────────────────
   One row per pair, with `a_id` always the lexicographically smaller of the two
   ids. That ordering is doing real work: it makes a duplicate impossible by
   construction rather than by checking. Two people who request each other at the
   same moment collide on the primary key, and requesting somebody who has already
   requested you *is* accepting them — the same shape as a simultaneous rematch,
   which resolves for the same reason.
   ─────────────────────────────────────────────────────────────────────────── */
export const friendshipStatus = pgEnum("friendship_status", [
  "pending",
  "accepted",
  "blocked",
]);

export const friendships = pgTable(
  "friendships",
  {
    aId: text("a_id")
      .notNull()
      .references(() => players.clerkUserId, { onDelete: "cascade" }),
    bId: text("b_id")
      .notNull()
      .references(() => players.clerkUserId, { onDelete: "cascade" }),
    status: friendshipStatus("status").notNull().default("pending"),
    /** Who asked, or — when the status is `blocked` — who blocked. Without it the
     *  row cannot say whether a request is yours to answer or theirs to wait on, and
     *  a block would be symmetrical when it is anything but. */
    actedBy: text("acted_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.aId, table.bId] }),
    index("friendships_b_idx").on(table.bId, table.status),
  ],
);

/** In-game chat. Append-only, one row per message, and the id is the cursor the
 *  event stream advertises — the same relationship `moves.seq` has to the board. */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    seat: text("seat", { enum: ["white", "black"] }).notNull(),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_game_idx").on(table.gameId, table.id)],
);

export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Move = typeof moves.$inferSelect;
export type PlayedGame = typeof playedGames.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type ChatMessage = typeof messages.$inferSelect;
