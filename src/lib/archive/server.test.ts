import { describe, expect, it } from "vitest";
import { rowToSummary, summaryToRow, validSummary } from "./server";
import { EMPTY_TALLY, type GameSummary } from "./types";
import type { PlayedGame } from "@/lib/db/schema";

const T = 1_700_000_000_000;

function summary(overrides: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "AB12CD",
    source: "engine",
    side: "white",
    opponent: "Karpov · 1600",
    opponentRating: 1600,
    outcome: "win",
    ending: "checkmate",
    moveCount: 40,
    firstMoves: "e4 e5 Nf3",
    initialMs: 600_000,
    incrementMs: 0,
    rated: false,
    playedAt: T,
    accuracy: 82,
    qualities: { ...EMPTY_TALLY, best: 12, blunder: 1 },
    hinted: 0,
    concepts: { fork: 1 },
    ...overrides,
  };
}

/* What a client says about its own history is its own business, so these checks are
   about shape and range rather than plausibility — enough that a hostile body cannot
   reach a column it does not fit, which is the difference between a 400 and a 500. */
describe("validSummary", () => {
  it("accepts an ordinary game, analysed or not", () => {
    expect(validSummary(summary())).toBe(true);
    expect(
      validSummary(summary({ accuracy: null, qualities: null, concepts: null, hinted: null })),
    ).toBe(true);
  });

  it("rejects a playedAt that would become an Invalid Date", () => {
    // `new Date(1e20)` is Invalid, and inserting one throws inside the driver.
    expect(validSummary(summary({ playedAt: 1e20 }))).toBe(false);
    expect(validSummary(summary({ playedAt: -1 }))).toBe(false);
    expect(validSummary(summary({ playedAt: Number.NaN }))).toBe(false);
  });

  it("rejects numbers that would overflow an integer column", () => {
    expect(validSummary(summary({ moveCount: 2 ** 31 }))).toBe(false);
    expect(validSummary(summary({ initialMs: 2 ** 31 }))).toBe(false);
    expect(validSummary(summary({ opponentRating: 1e12 }))).toBe(false);
    expect(
      validSummary(summary({ qualities: { ...EMPTY_TALLY, blunder: 2 ** 31 } })),
    ).toBe(false);
  });

  it("rejects an accuracy outside a percentage", () => {
    expect(validSummary(summary({ accuracy: 101 }))).toBe(false);
    expect(validSummary(summary({ accuracy: -1 }))).toBe(false);
  });

  it("caps the one free-form field", () => {
    const many = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [`slug-${i}`, 1]),
    );
    expect(validSummary(summary({ concepts: many }))).toBe(false);
    expect(validSummary(summary({ concepts: { ["a".repeat(65)]: 1 } }))).toBe(false);
  });

  it("rejects the wrong enum, the wrong type, and an empty id", () => {
    expect(validSummary(summary({ id: "" }))).toBe(false);
    expect(validSummary(summary({ source: "wherever" as never }))).toBe(false);
    expect(validSummary(summary({ outcome: "kind-of" as never }))).toBe(false);
    expect(validSummary(summary({ opponent: 42 as never }))).toBe(false);
  });
});

describe("summaryToRow", () => {
  it("takes the owner from its argument and never from the summary", () => {
    /* The one field a client can never set. Everything else about your own history is
       yours to state; whose history it is, is not. */
    const row = summaryToRow("user_me", {
      ...summary(),
      ...({ ownerId: "user_someone_else" } as object),
    });
    expect(row.ownerId).toBe("user_me");
  });

  it("spreads the tally into the columns a statistics query sums", () => {
    const row = summaryToRow("user_me", summary());
    expect(row.bests).toBe(12);
    expect(row.blunders).toBe(1);
    expect(row.rated).toBe(0);
  });
});

describe("rowToSummary", () => {
  const row = (overrides: Partial<PlayedGame> = {}): PlayedGame =>
    ({
      ownerId: "user_me",
      gameId: "AB12CD",
      source: "online",
      side: "black",
      opponent: "chijex5",
      opponentRating: 1500,
      outcome: "loss",
      ending: "timeout",
      moveCount: 30,
      firstMoves: "e4 c5 Nf3",
      initialMs: 180_000,
      incrementMs: 0,
      rated: 1,
      accuracy: null,
      brilliants: null,
      bests: null,
      inaccuracies: null,
      mistakes: null,
      blunders: null,
      hinted: null,
      concepts: null,
      playedAt: new Date(T),
      ...overrides,
    }) as PlayedGame;

  it("reports an unanalysed game as having no tally rather than a tally of zeroes", () => {
    /* The common case for an online game the server filed at the result. A tally of
       zeroes would enter the averages as a flawless game. */
    const unanalysed = rowToSummary(row());
    expect(unanalysed.accuracy).toBeNull();
    expect(unanalysed.qualities).toBeNull();
  });

  it("fills the tally once there is an accuracy", () => {
    const analysed = rowToSummary(row({ accuracy: 77, blunders: 2, bests: 9 }));
    expect(analysed.accuracy).toBe(77);
    expect(analysed.qualities).toMatchObject({ blunder: 2, best: 9, mistake: 0 });
  });

  it("round-trips through summaryToRow", () => {
    const original = summary();
    const back = rowToSummary(summaryToRow("user_me", original) as PlayedGame);
    expect(back).toEqual(original);
  });
});
