import type { Friendship } from "@/lib/db/schema";

/* ── One row per pair ─────────────────────────────────────────────────────────
   The whole design is in the key. `a_id` is always the lexicographically smaller of
   the two ids, so a pair has exactly one row by construction rather than by checking
   for one — two people who request each other in the same second collide on the
   primary key, and the loser's insert becomes an update of the winner's row.

   That turns the awkward case into the good case: requesting somebody who has already
   requested you *is* accepting them. It is the same trick that makes two simultaneous
   rematch offers resolve into one game instead of deadlocking, and it is the reason
   there is no "crossed requests" state to render.
   ─────────────────────────────────────────────────────────────────────────── */

export type Pair = { aId: string; bId: string };

/** The canonical row key for two players, in either order. */
export function pairKey(x: string, y: string): Pair {
  return x < y ? { aId: x, bId: y } : { aId: y, bId: x };
}

export type FriendState =
  /** No row: strangers. */
  | "none"
  /** You asked; they have not answered. */
  | "outgoing"
  /** They asked; the answer is yours. */
  | "incoming"
  | "friends"
  /** You blocked them. */
  | "blocked"
  /** They blocked you — which you are never told, only refused. */
  | "blocked-by";

export type FriendRow = Pick<Friendship, "aId" | "bId" | "status" | "actedBy">;

/**
 * What the row means, from one side of it.
 *
 * `actedBy` is what makes a single row asymmetric: without it a pending row cannot say
 * whose turn it is, and a block would read the same to the person who made it and the
 * person it was made against.
 */
export function friendshipState(row: FriendRow | null, me: string): FriendState {
  if (!row) return "none";
  if (row.aId !== me && row.bId !== me) return "none";
  if (row.status === "accepted") return "friends";
  if (row.status === "blocked") return row.actedBy === me ? "blocked" : "blocked-by";
  return row.actedBy === me ? "outgoing" : "incoming";
}

/** Whether these two may challenge or talk to each other. A block is mutual in effect
 *  even though only one of them made it. */
export function canInteract(state: FriendState): boolean {
  return state !== "blocked" && state !== "blocked-by";
}

export type FriendAction = "request" | "accept" | "decline" | "remove" | "block" | "unblock";

export type Transition =
  /** Write the row with this status, attributed to the actor. */
  | { effect: "upsert"; status: "pending" | "accepted" | "blocked" }
  | { effect: "delete" }
  /** Already true. Not an error — pressing "add friend" twice should not be one. */
  | { effect: "none" }
  | { effect: "refuse"; reason: string };

/**
 * The whole state machine, as a pure function.
 *
 * Separated from the database so that the awkward cases — accepting an offer nobody
 * made, befriending somebody who has blocked you, requesting twice — are answered by
 * something a test can ask directly rather than by reading a route.
 */
export function transition(state: FriendState, action: FriendAction): Transition {
  /* A block outranks everything, in both directions. The person who was blocked is
     refused without being told which of the two states they are in: "blocked-by" and a
     deleted account should be indistinguishable from the outside. */
  if (state === "blocked-by" && action !== "block") {
    return { effect: "refuse", reason: "not-available" };
  }
  if (state === "blocked" && action !== "unblock" && action !== "block") {
    return { effect: "refuse", reason: "blocked" };
  }

  switch (action) {
    case "request":
      if (state === "friends") return { effect: "none" };
      if (state === "outgoing") return { effect: "none" };
      // Asking back is accepting. See the header comment.
      if (state === "incoming") return { effect: "upsert", status: "accepted" };
      return { effect: "upsert", status: "pending" };

    case "accept":
      if (state === "friends") return { effect: "none" };
      if (state !== "incoming") return { effect: "refuse", reason: "no-request" };
      return { effect: "upsert", status: "accepted" };

    case "decline":
      // Also how you withdraw your own request: the row goes either way.
      if (state === "incoming" || state === "outgoing") return { effect: "delete" };
      return { effect: "refuse", reason: "no-request" };

    case "remove":
      if (state === "friends") return { effect: "delete" };
      return { effect: "refuse", reason: "not-friends" };

    case "block":
      if (state === "blocked") return { effect: "none" };
      return { effect: "upsert", status: "blocked" };

    case "unblock":
      if (state !== "blocked") return { effect: "refuse", reason: "not-blocked" };
      return { effect: "delete" };
  }
}
