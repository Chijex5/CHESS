import * as Sentry from "@sentry/nextjs";

/* ── Server-side observability ────────────────────────────────────────────────
   Next 16 calls `register()` once per server instance, before the first request is
   served, and `onRequestError` whenever it captures a server error. Both live here
   because both are framework hooks — the actual `Sentry.init` calls are in the two
   config files, one per runtime, because the Node and Edge SDKs are different
   builds and only one of them is loaded.

   `src/instrumentation.ts` rather than the repo root: this project keeps its source
   under `src/`, and Next looks in both.
   ─────────────────────────────────────────────────────────────────────────── */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/* Server Components, route handlers, server actions and the proxy, without a
   `captureException` in each one. Note what this does *not* cover: an error your own
   code catches and turns into a JSON 500 never reaches the framework, so Sentry
   never sees it. Those need capturing at the catch site. */
export const onRequestError = Sentry.captureRequestError;
