"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/* ── The last resort ──────────────────────────────────────────────────────────
   React catches a render error before Sentry's global handler can see it, so a
   boundary has to report it by hand — without this file, the one class of error
   that blanks the whole page is the one class that never arrives.

   It replaces the root layout when it fires, which is why it renders its own
   `<html>` and `<body>` and why it cannot use any of the app's chrome.
   ─────────────────────────────────────────────────────────────────────────── */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100svh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "ui-serif, Georgia, serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>The board slipped.</h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: "0.875rem" }}>
          Something broke badly enough to take the page with it. It has been reported.
        </p>
        {/* `reset()` re-renders the tree rather than reloading, which is enough for a
            transient failure and cheap for one that is not. */}
        <button
          onClick={() => reset()}
          style={{
            border: "1px solid currentColor",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            background: "transparent",
            cursor: "pointer",
            font: "inherit",
            fontSize: "0.875rem",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
