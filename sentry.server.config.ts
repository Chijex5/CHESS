import * as Sentry from "@sentry/nextjs";

/* ── The Node runtime ─────────────────────────────────────────────────────────
   Where every database call in this app actually happens. Loaded by
   `src/instrumentation.ts` when `NEXT_RUNTIME === "nodejs"`.

   Kept at the repo root rather than under `src/`: these two files are imported by
   path from the instrumentation hook, and the Sentry build plugin looks for them
   here. Only the framework conventions (`instrumentation.ts`,
   `instrumentation-client.ts`) have to live under `src/`.
   ─────────────────────────────────────────────────────────────────────────── */

Sentry.init({
  /* Either name works and they hold the same value: a DSN is a write-only ingest key,
     not a credential. Reading the public one as a fallback means a single variable
     configures all three runtimes — the alternative is a server that silently reports
     nothing because only the `NEXT_PUBLIC_` name got filled in. */
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Everything in dev, a tenth in production. Tracing is what turns "a route was
     slow" into "a route was slow because one query took four seconds". */
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  /* Local variables on stack frames. The reason this is on: a Postgres error reads
     `duplicate key value violates unique constraint` with no hint as to *which*
     value, and the frame's locals usually hold it. */
  includeLocalVariables: true,

  environment: process.env.NODE_ENV,

  /* `SENTRY_DEBUG=1 pnpm dev` makes the SDK narrate: what it captured, the envelope it
     built, and the ingest response. That last line is the difference between "we sent
     it" and "Sentry accepted it". Off by default; it is loud. */
  debug: process.env.SENTRY_DEBUG === "1",

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
