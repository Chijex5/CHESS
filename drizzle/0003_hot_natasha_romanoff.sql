CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."game_outcome" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TYPE "public"."game_source" AS ENUM('engine', 'online');--> statement-breakpoint
CREATE TABLE "friendships" (
	"a_id" text NOT NULL,
	"b_id" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"acted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_a_id_b_id_pk" PRIMARY KEY("a_id","b_id")
);
--> statement-breakpoint
CREATE TABLE "game_reviews" (
	"owner_id" text NOT NULL,
	"game_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_reviews_owner_id_game_id_pk" PRIMARY KEY("owner_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"seat" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "played_games" (
	"owner_id" text NOT NULL,
	"game_id" text NOT NULL,
	"source" "game_source" NOT NULL,
	"side" text NOT NULL,
	"opponent" text NOT NULL,
	"opponent_rating" integer,
	"outcome" "game_outcome" NOT NULL,
	"ending" "game_ending",
	"move_count" integer NOT NULL,
	"first_moves" text DEFAULT '' NOT NULL,
	"initial_ms" integer DEFAULT 0 NOT NULL,
	"increment_ms" integer DEFAULT 0 NOT NULL,
	"rated" integer DEFAULT 0 NOT NULL,
	"accuracy" real,
	"brilliants" integer,
	"bests" integer,
	"inaccuracies" integer,
	"mistakes" integer,
	"blunders" integer,
	"hinted" integer,
	"concepts" jsonb,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "played_games_owner_id_game_id_pk" PRIMARY KEY("owner_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "invited_id" text;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_a_id_players_clerk_user_id_fk" FOREIGN KEY ("a_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_b_id_players_clerk_user_id_fk" FOREIGN KEY ("b_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_reviews" ADD CONSTRAINT "game_reviews_owner_id_players_clerk_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "played_games" ADD CONSTRAINT "played_games_owner_id_players_clerk_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_b_idx" ON "friendships" USING btree ("b_id","status");--> statement-breakpoint
CREATE INDEX "messages_game_idx" ON "messages" USING btree ("game_id","id");--> statement-breakpoint
CREATE INDEX "played_owner_idx" ON "played_games" USING btree ("owner_id","played_at");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_invited_id_players_clerk_user_id_fk" FOREIGN KEY ("invited_id") REFERENCES "public"."players"("clerk_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_invited_idx" ON "games" USING btree ("invited_id","status");