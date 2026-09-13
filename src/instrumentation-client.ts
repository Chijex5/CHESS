import * as Sentry from "@sentry/nextjs";

/* ── The browser ──────────────────────────────────────────────────────────────
   Runs before the app becomes interactive. The DSN has to be `NEXT_PUBLIC_` here
   because this is bundled and shipped — a DSN is a write-only ingest key and is
   meant to be public, unlike `SENTRY_AUTH_TOKEN`, which is not and stays a build
   secret.

   Session Replay is deliberately not enabled. It is the SDK's headline client
   feature, but it records what people do on a page, and nothing on the board needs
   recording to debug a query. Worth turning on later for the chat and friend flows
   if those misbehave.
   ─────────────────────────────────────────────────────────────────────────── */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [Sentry.replayIntegration()],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;