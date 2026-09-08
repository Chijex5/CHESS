import { describe, expect, it } from "vitest";
import {
  canInteract,
  friendshipState,
  pairKey,
  transition,
  type FriendRow,
  type FriendState,
} from "./friends";

const ME = "user_aaa";
const THEM = "user_zzz";

const row = (
  status: FriendRow["status"],
  actedBy: string,
  pair = pairKey(ME, THEM),
): FriendRow => ({ ...pair, status, actedBy });

describe("pairKey", () => {
  it("is the same row whichever way round you ask", () => {
    // The property the primary key relies on: crossed requests must collide.
    expect(pairKey(ME, THEM)).toEqual(pairKey(THEM, ME));
    expect(pairKey(ME, THEM)).toEqual({ aId: ME, bId: THEM });
  });
});

describe("friendshipState", () => {
  it("reads a pending row from both sides", () => {
    expect(friendshipState(row("pending", ME), ME)).toBe("outgoing");
    expect(friendshipState(row("pending", ME), THEM)).toBe("incoming");
  });

  it("distinguishes blocking from being blocked", () => {
    /* One row, two meanings. Without `actedBy` a block would look identical to the
       person who made it and the person it was made against. */
    expect(friendshipState(row("blocked", ME), ME)).toBe("blocked");
    expect(friendshipState(row("blocked", ME), THEM)).toBe("blocked-by");
  });

  it("is symmetric once accepted", () => {
    expect(friendshipState(row("accepted", ME), ME)).toBe("friends");
    expect(friendshipState(row("accepted", ME), THEM)).toBe("friends");
  });

  it("says nothing about a row you are not in", () => {
    expect(friendshipState(row("accepted", ME), "user_someone_else")).toBe("none");
    expect(friendshipState(null, ME)).toBe("none");
  });
});

describe("canInteract", () => {
  it("is false in both directions of a block", () => {
    // A block is one-sided to make and mutual in effect.
    expect(canInteract("blocked")).toBe(false);
    expect(canInteract("blocked-by")).toBe(false);
    expect(canInteract("none")).toBe(true);
    expect(canInteract("friends")).toBe(true);
  });
});

describe("transition", () => {
  it("makes asking back the same as accepting", () => {
    /* The case a two-row design turns into a deadlock: both press "add friend" and
       each waits for the other to answer an offer that replaced theirs. */
    expect(transition("incoming", "request")).toEqual({
      effect: "upsert",
      status: "accepted",
    });
  });

  it("treats a repeated request as already done rather than an error", () => {
    expect(transition("outgoing", "request")).toEqual({ effect: "none" });
    expect(transition("friends", "request")).toEqual({ effect: "none" });
  });

  it("refuses to accept an offer nobody made", () => {
    expect(transition("none", "accept")).toMatchObject({ effect: "refuse" });
    expect(transition("outgoing", "accept")).toMatchObject({ effect: "refuse" });
  });

  it("lets decline both refuse and withdraw", () => {
    expect(transition("incoming", "decline")).toEqual({ effect: "delete" });
    expect(transition("outgoing", "decline")).toEqual({ effect: "delete" });
  });

  it("only removes an actual friendship", () => {
    expect(transition("friends", "remove")).toEqual({ effect: "delete" });
    expect(transition("outgoing", "remove")).toMatchObject({ effect: "refuse" });
  });

  it("lets a block be made from any state", () => {
    const states: FriendState[] = ["none", "outgoing", "incoming", "friends"];
    for (const state of states) {
      expect(transition(state, "block")).toEqual({ effect: "upsert", status: "blocked" });
    }
  });

  it("refuses everything to someone who has been blocked, without saying why", () => {
    /* "Blocked by them" must be indistinguishable from a deleted account: a reason that
       named the block would tell the blocked person exactly what happened, which is the
       one thing blocking is meant to avoid. */
    for (const action of ["request", "accept", "decline", "remove", "unblock"] as const) {
      expect(transition("blocked-by", action)).toEqual({
        effect: "refuse",
        reason: "not-available",
      });
    }
  });

  it("lets the blocker undo it, and nothing else", () => {
    expect(transition("blocked", "unblock")).toEqual({ effect: "delete" });
    expect(transition("blocked", "request")).toMatchObject({ effect: "refuse" });
    expect(transition("blocked", "accept")).toMatchObject({ effect: "refuse" });
    expect(transition("none", "unblock")).toMatchObject({ effect: "refuse" });
  });

  it("lets the blocked person block back", () => {
    // Otherwise being blocked first would deny you the same protection.
    expect(transition("blocked-by", "block")).toEqual({
      effect: "upsert",
      status: "blocked",
    });
  });
});
