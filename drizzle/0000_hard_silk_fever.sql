CREATE TYPE "public"."assistance" AS ENUM('none', 'full');--> statement-breakpoint
CREATE TYPE "public"."game_ending" AS ENUM('checkmate', 'resignation', 'timeout', 'stalemate', 'insufficient-material', 'threefold', 'fifty-move', 'agreement', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('pending', 'active', 'finished', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."game_winner" AS ENUM('white', 'black', 'draw');--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"white_id" text,
	"black_id" text,
	"status" "game_status" DEFAULT 'pending' NOT NULL,
	"winner" "game_winner",
	"ending" "game_ending",
	"initial_ms" integer NOT NULL,
	"increment_ms" integer DEFAULT 0 NOT NULL,
	"assistance" "assistance" DEFAULT 'none' NOT NULL,
	"rated" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"game_id" text NOT NULL,
	"seq" integer NOT NULL,
	"san" text NOT NULL,
	"uci" text NOT NULL,
	"fen_after" text NOT NULL,
	"ms_left_white" integer NOT NULL,
	"ms_left_black" integer NOT NULL,
	"played_at" bigint NOT NULL,
	CONSTRAINT "moves_game_id_seq_pk" PRIMARY KEY("game_id","seq")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"game_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"offered_by" text NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"clerk_user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"rating" real DEFAULT 1500 NOT NULL,
	"rd" real DEFAULT 350 NOT NULL,
	"volatility" real DEFAULT 0.06 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_id_players_clerk_user_id_fk" FOREIGN KEY ("white_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_id_players_clerk_user_id_fk" FOREIGN KEY ("black_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_players_clerk_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."players"("clerk_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_white_idx" ON "games" USING btree ("white_id","created_at");--> statement-breakpoint
CREATE INDEX "games_black_idx" ON "games" USING btree ("black_id","created_at");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invites_game_idx" ON "invites" USING btree ("game_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_username_idx" ON "players" USING btree ("username");