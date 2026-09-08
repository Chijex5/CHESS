"use client";

import type { Archive, ArchivedReview, GameSummary } from "./types";

/* ── The local archive ────────────────────────────────────────────────────────
   IndexedDB rather than `localStorage`, which every other store in this app uses.
   The difference is volume: a review is tens of kilobytes, and fifty of them is most
   of `localStorage`'s five-megabyte budget — a budget already spent on the live
   game, the settings and the working set. Overrunning it throws `QuotaExceededError`
   from a synchronous write that zustand's persist middleware swallows, so the
   failure mode would be history that silently stops being saved.

   No dependency and no schema library: two object stores, one index, one upgrade
   path. The API is old and callback-based, so it is wrapped once here and never
   thought about again.
   ─────────────────────────────────────────────────────────────────────────── */

const DB_NAME = "coach-archive";
const DB_VERSION = 1;
const SUMMARIES = "summaries";
const REVIEWS = "reviews";

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  opening ??= new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Private-browsing modes and locked-down profiles refuse outright.
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUMMARIES)) {
        const store = db.createObjectStore(SUMMARIES, { keyPath: "id" });
        // The only ordering any reader wants, and the only one worth an index.
        store.createIndex("playedAt", "playedAt");
      }
      if (!db.objectStoreNames.contains(REVIEWS)) {
        db.createObjectStore(REVIEWS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    /* Another tab holding an old version open blocks the upgrade indefinitely.
       Resolving null degrades to "no history on this device" rather than hanging
       every caller for the life of the page. */
    request.onblocked = () => resolve(null);
  });
  return opening;
}

/** Wraps one transaction. Resolves on `complete`, not on the last request's
 *  `success`: a write is not durable until the transaction commits. */
function run<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    let value: T;
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(stores, mode);
    } catch {
      return resolve(null);
    }
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => resolve(null);
    transaction.onabort = () => resolve(null);
    void Promise.resolve(body(transaction))
      .then((result) => {
        value = result;
      })
      .catch(() => transaction.abort());
  });
}

const asPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const localArchive: Archive = {
  async put(summary, review) {
    const db = await open();
    if (!db) return;
    await run(db, [SUMMARIES, REVIEWS], "readwrite", (tx) => {
      tx.objectStore(SUMMARIES).put(summary);
      /* A null review means "no new analysis", not "delete the analysis". The first
         save happens when the game ends and the second when the coach's notes land,
         and the game-over save must not wipe a review a later pass wrote. */
      if (review) tx.objectStore(REVIEWS).put({ id: summary.id, review });
    });
  },

  async summaries(limit = 200) {
    const db = await open();
    if (!db) return [];
    const rows = await run(db, [SUMMARIES], "readonly", async (tx) => {
      const index = tx.objectStore(SUMMARIES).index("playedAt");
      /* `getAll` on the index returns ascending; the callers all want newest first
         and a couple of hundred rows is not worth a cursor to reverse. */
      const all = await asPromise(index.getAll());
      return (all as GameSummary[]).reverse().slice(0, limit);
    });
    return rows ?? [];
  },

  async review(id) {
    const db = await open();
    if (!db) return null;
    const row = await run(db, [REVIEWS], "readonly", (tx) =>
      asPromise(tx.objectStore(REVIEWS).get(id)),
    );
    // Stored under a wrapper so the key is not a field the review itself has to carry.
    return (row as { review: ArchivedReview } | undefined)?.review ?? null;
  },

  async remove(id) {
    const db = await open();
    if (!db) return;
    await run(db, [SUMMARIES, REVIEWS], "readwrite", (tx) => {
      tx.objectStore(SUMMARIES).delete(id);
      tx.objectStore(REVIEWS).delete(id);
    });
  },
};
