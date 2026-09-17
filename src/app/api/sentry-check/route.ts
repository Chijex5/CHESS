import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

/* ── TEMPORARY — delete once Sentry is confirmed ──────────────────────────────
   A real error through the real stack, which is the only kind worth verifying
   with: it runs inside a route handler, so it travels the same path as the bug
   being chased — thrown, uncaught, into `onRequestError`.

   Two modes, because they prove different things:
     · `/api/sentry-check`      a plain throw — proves the wiring
     · `/api/sentry-check?db=1` a deliberately invalid query — proves a *Postgres*
                                error arrives with its driver detail intact, which
                                is the actual question

   Dev-only. In production it 404s, so shipping it by accident is not an incident —
   though it is still meant to be deleted.
   ─────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  if (new URL(request.url).searchParams.get("db") === "1") {
    // A table that does not exist: Neon answers with a real Postgres error, which is
    // what this is for — it shows how much driver detail survives the trip.
    await db.execute(sql`select * from a_table_that_does_not_exist`);
    return NextResponse.json({ ok: true });
  }

  throw new Error("Sentry verification error — delete /api/sentry-check");
}
