import { describe, expect, it } from "vitest";
import { HOUSE_ID, HOUSE_USERNAME, botDisplayName, housePlayer, isHouse } from "./bot";

/* ── The engine's seat ────────────────────────────────────────────────────────
   The point of these is that a bot's *name* is no longer a key. It used to be a
   `players.username`, which is UNIQUE, so two games rolling the same one threw on the
   insert and a human registering it broke their own account. Now it is a label on the
   game and only one username exists to reserve.
   ─────────────────────────────────────────────────────────────────────────── */

describe("isHouse", () => {
  it("recognises the one shared seat and nothing else", () => {
    expect(isHouse(HOUSE_ID)).toBe(true);
    expect(isHouse(null)).toBe(false);
    // Clerk ids are `user_…`, so there is no shape to confuse it with.
    expect(isHouse("user_3IvxSfyEeks6G686hUdsEbrvkQU")).toBe(false);
    /* Explicitly not a prefix match. The first version keyed the bot seat on
       `startsWith("engine:")` with a per-game id after it; anything of that shape is now
       a stale row rather than a live seat. */
    expect(isHouse("engine:AB12CD")).toBe(false);
  });
});

describe("HOUSE_USERNAME", () => {
  it("is a single name, which is the whole reason it can be reserved", () => {
    /* Clerk has no reserved-username setting — its block-list takes emails, phone
       numbers and web3 wallets — so the only way to hold a name is to occupy it with a
       real user. That is affordable for one name and not for 4,500. */
    expect(HOUSE_USERNAME).toBe("engine");
    expect(HOUSE_ID.startsWith("user_")).toBe(false);
  });
});

describe("botDisplayName", () => {
  it("is a plausible handle rather than an announcement", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(botDisplayName()).toMatch(/^[A-Z][a-zA-Z]+\d{3}$/);
    }
  });

  it("is allowed to repeat", () => {
    /* Not a uniqueness test — the opposite. Two games showing the same name is now as
       harmless as two people sharing a first name, and asserting uniqueness here would
       be re-introducing the constraint that caused the bug. */
    const names = new Set(Array.from({ length: 400 }, botDisplayName));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("housePlayer", () => {
  it("takes the strength from the game, not from the shared row", () => {
    // One row serves every fallback game, so its own rating says nothing about this one.
    expect(housePlayer({ botName: "NorthStar314", engineElo: 1740 })).toEqual({
      username: "NorthStar314",
      rating: 1740,
      provisional: true,
    });
  });

  it("is always provisional, because the number is a difficulty and not a history", () => {
    expect(housePlayer({ botName: "AmberRook201", engineElo: 2400 }).provisional).toBe(true);
  });

  it("survives a game written before the column existed", () => {
    const fallback = housePlayer({ botName: null, engineElo: null });
    expect(fallback.username).toBe("Opponent");
    expect(fallback.rating).toBe(1500);
  });
});
