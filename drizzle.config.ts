import { defineConfig } from "drizzle-kit";

/* Migrations run against the *unpooled* endpoint. DDL needs a real session, and
   Neon's pooler multiplexes statements across connections — which is fine for the
   app's short reads and wrong for `CREATE TABLE`. */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? "",
  },
  strict: true,
  verbose: true,
});
