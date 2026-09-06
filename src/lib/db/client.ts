import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/* Pooled, over HTTP. Neon's driver speaks Postgres over a fetch, which is the
   right shape for a function that runs for milliseconds and holds no connection
   between requests — a TCP pool would spend its life reconnecting.

   `DATABASE_URL` is the pooled endpoint. The unpooled one exists for migrations,
   which need a real session, and `drizzle.config.ts` uses it there. */
function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Multiplayer needs Postgres: run `vercel env pull` " +
        "if the Neon integration is already installed, or `vercel integration add neon`.",
    );
  }
  return url;
}

/* Created once per module instance rather than per request. The client is a thin
   wrapper over `fetch` with no socket to leak, so there is nothing to tear down. */
export const db = drizzle(neon(connectionString()), { schema });

export { schema };
