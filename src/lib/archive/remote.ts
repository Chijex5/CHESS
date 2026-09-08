"use client";

import type { Archive, ArchivedReview, GameSummary } from "./types";

/* The remote archive is three fetches. It exists as its own module only so that
   `index.ts` can choose between backends without either of them knowing the other is
   there — and so a signed-in player's history is one round trip rather than a merge of
   two stores that could disagree. */
export const remoteArchive: Archive = {
  async put(summary, review) {
    await fetch("/api/archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ summary, review }),
    }).catch(() => null);
  },

  async summaries(limit = 200) {
    const response = await fetch(`/api/archive?limit=${limit}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return [];
    const body = (await response.json().catch(() => null)) as
      | { summaries?: GameSummary[] }
      | null;
    return body?.summaries ?? [];
  },

  async review(id) {
    const response = await fetch(`/api/archive/${id}`, { cache: "no-store" }).catch(
      () => null,
    );
    if (!response?.ok) return null;
    const body = (await response.json().catch(() => null)) as
      | { review?: ArchivedReview | null }
      | null;
    return body?.review ?? null;
  },

  async remove(id) {
    await fetch(`/api/archive/${id}`, { method: "DELETE" }).catch(() => null);
  },
};
