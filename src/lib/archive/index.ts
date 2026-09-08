"use client";

import { localArchive } from "./local";
import { remoteArchive } from "./remote";
import type { Archive } from "./types";

/* ── Which archive ────────────────────────────────────────────────────────────
   Postgres when signed in, IndexedDB when not, and never both. A merge of the two
   would mean deciding which is right whenever they disagreed, and there is no honest
   answer to that: the local copy is whatever this device happened to see.

   So a signed-out player's history lives on the device they played on — the same deal
   single player has always had — and signing in is what buys history everywhere. The
   one-time import in `import-local.ts` is the bridge between those two worlds.
   ─────────────────────────────────────────────────────────────────────────── */

/** Null until something tells us, which is what the fallback in `archive()` is for. */
let signedIn: boolean | null = null;

/** Called from React, where the session is known without asking the server. */
export function setArchiveSignedIn(value: boolean): void {
  signedIn = value;
}

export async function archive(): Promise<Archive> {
  if (signedIn === null) {
    /* Only reached if a game ends before anything has reported the session — a
       controller is not a component and cannot read a hook. One request, once, and
       `/api/me` answers 401 signed out, which is the same question asked of the
       authority that decides it. */
    signedIn = await fetch("/api/me", { cache: "no-store" })
      .then((response) => response.ok)
      .catch(() => false);
  }
  return signedIn ? remoteArchive : localArchive;
}

export { localArchive, remoteArchive };
export * from "./types";
