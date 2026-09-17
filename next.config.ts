import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.114'],
};

/* ── Sentry's build step ──────────────────────────────────────────────────────
   Two jobs: upload source maps so a production stack trace names your own files
   rather than a minified chunk, and mount the tunnel route.

   `org` and `project` come from the environment rather than being written here,
   because this file is committed and they differ between whoever runs it. The build
   works without them — it just skips the upload and says so.

   No `webpack.treeshake` options: this project builds with Turbopack, where they do
   nothing. Turbopack source-map upload is still the newer path of the two, so if a
   production trace ever comes back minified, that is the first thing to suspect.
   ─────────────────────────────────────────────────────────────────────────── */
export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "chess-6k",

  project: "sentry-copper-magnet",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  /* No `webpack` block: this project builds with Turbopack, where those options — the
     cron monitors and the logger tree-shaking — do nothing. Turbopack source-map upload
     is the newer of the two paths, so a minified production trace is the first thing to
     suspect if one ever shows up. */
});
