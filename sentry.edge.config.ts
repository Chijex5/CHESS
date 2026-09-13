import * as Sentry from "@sentry/nextjs";

/* ── The Edge runtime ─────────────────────────────────────────────────────────
   Clerk's `proxy.ts` runs here, so this is the file that reports an auth failure that
   happens before a route is ever reached. Limited Node API access, which is why
   `includeLocalVariables` is absent rather than merely false.
   ─────────────────────────────────────────────────────────────────────────── */

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  environment: process.env.NODE_ENV,
  debug: process.env.SENTRY_DEBUG === "1",

  dataCollection: {
    // userInfo: false,
    // httpBodies: [],
  },
});
