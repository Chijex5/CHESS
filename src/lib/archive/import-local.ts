"use client";

import { localArchive } from "./local";
import { remoteArchive } from "./remote";

/* ── The bridge between signed out and signed in ──────────────────────────────
   The archive picks one backend and never merges, which is what makes it
   unambiguous — but it leaves one seam. Play twenty games against the engine without
   an account and they are in IndexedDB; sign in, and the archive starts answering from
   Postgres, so those twenty vanish from a page that a moment ago listed them.

   This carries them across, once.

   Once *per browser*, not per account, and that is deliberate: the local games belong
   to whoever was sitting here, and a second person signing in on the same machine must
   not inherit the first person's history. First account in claims them; anybody after
   that gets their own empty archive, which is the honest answer.

   The local copies are left where they are. They cost nothing, they are what a
   subsequent sign-out would show, and if the upload half-fails they are the only
   remaining copy.
   ─────────────────────────────────────────────────────────────────────────── */

const FLAG = "coach-archive-imported";

/** Bounded so that a long history cannot turn one sign-in into hundreds of requests.
 *  Newest first, so the games worth keeping are the ones that make it. */
const LIMIT = 60;

function claimed(): boolean {
  try {
    return localStorage.getItem(FLAG) !== null;
  } catch {
    // No storage means no local archive either, so there is nothing to import.
    return true;
  }
}

function claim(): void {
  try {
    localStorage.setItem(FLAG, new Date().toISOString());
  } catch {
    // Nothing to do: the worst case is trying again next sign-in, which is idempotent
    // anyway because the upsert is keyed on (owner, game).
  }
}

/**
 * Uploads this device's games to the signed-in player's archive.
 *
 * Returns how many were sent. Safe to call repeatedly — the flag stops it after the
 * first run, and the route upserts by (owner, game) so a retry after a partial failure
 * writes the same rows rather than duplicates.
 */
export async function importLocalGames(): Promise<number> {
  if (claimed()) return 0;

  const summaries = await localArchive.summaries(LIMIT);
  if (summaries.length === 0) {
    /* Nothing here, and nothing will be: from now on this browser's games go straight to
       Postgres. Claiming anyway means a later sign-out-play-sign-in does not silently
       hand those games to this account. */
    claim();
    return 0;
  }

  /* Sequential. This runs in the background of a sign-in, so it has all the time it
     needs, and forty parallel uploads of thirty kilobytes each is a way to make the
     first page after signing in feel broken. */
  let sent = 0;
  for (const summary of summaries) {
    const review = await localArchive.review(summary.id);
    await remoteArchive.put(summary, review);
    sent += 1;
  }

  claim();
  return sent;
}
