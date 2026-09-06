import { describe, expect, it } from "vitest";
import {
  UNRATED,
  applyGame,
  displayRating,
  isProvisional,
  updateRating,
} from "./rating";

/* The first test is the only one that matters. Glickman's paper works a specific
   example all the way through and prints the answers; anything that reproduces
   them has implemented Glicko-2, and anything that does not has implemented
   something else that looks like it. The rest of the file checks the properties a
   chess app relies on. */
describe("Glicko-2 against the paper's worked example", () => {
  it("reproduces r'=1464.06, RD'=151.52, sigma'=0.05999", () => {
    const player = { rating: 1500, rd: 200, volatility: 0.06 };
    const next = updateRating(player, [
      { rating: 1400, rd: 30, score: 1 },
      { rating: 1550, rd: 100, score: 0 },
      { rating: 1700, rd: 300, score: 0 },
    ]);

    expect(next.rating).toBeCloseTo(1464.06, 1);
    expect(next.rd).toBeCloseTo(151.52, 1);
    expect(next.volatility).toBeCloseTo(0.05999, 4);
  });
});

describe("sitting out a period", () => {
  it("leaves the rating alone and widens the deviation", () => {
    const next = updateRating({ rating: 1600, rd: 80, volatility: 0.06 }, []);
    expect(next.rating).toBe(1600);
    expect(next.rd).toBeGreaterThan(80);
    expect(next.volatility).toBe(0.06);
  });

  it("never widens past the initial deviation", () => {
    let r = { ...UNRATED };
    for (let i = 0; i < 50; i += 1) r = updateRating(r, []);
    expect(r.rd).toBe(350);
  });
});

describe("one game", () => {
  it("moves the winner up and the loser down by the same amount when equal", () => {
    const equal = { rating: 1500, rd: 60, volatility: 0.06 };
    const { white, black } = applyGame(equal, { ...equal }, "white");
    expect(white.rating).toBeGreaterThan(1500);
    expect(black.rating).toBeLessThan(1500);
    expect(white.rating - 1500).toBeCloseTo(1500 - black.rating, 6);
  });

  it("barely moves either player on a draw between equals", () => {
    const equal = { rating: 1500, rd: 60, volatility: 0.06 };
    const { white, black } = applyGame(equal, { ...equal }, "draw");
    expect(white.rating).toBeCloseTo(1500, 6);
    expect(black.rating).toBeCloseTo(1500, 6);
  });

  it("rewards beating a stronger opponent more than a weaker one", () => {
    const me = { rating: 1500, rd: 60, volatility: 0.06 };
    const weak = { rating: 1200, rd: 60, volatility: 0.06 };
    const strong = { rating: 1800, rd: 60, volatility: 0.06 };
    const overWeak = applyGame(me, weak, "white").white.rating - 1500;
    const overStrong = applyGame(me, strong, "white").white.rating - 1500;
    expect(overStrong).toBeGreaterThan(overWeak);
    expect(overWeak).toBeGreaterThan(0);
  });

  it("moves an uncertain rating further than a settled one", () => {
    const opponent = { rating: 1500, rd: 60, volatility: 0.06 };
    const fresh = applyGame({ ...UNRATED }, opponent, "white").white.rating - 1500;
    const settled = applyGame(
      { rating: 1500, rd: 45, volatility: 0.06 },
      opponent,
      "white",
    ).white.rating - 1500;
    expect(fresh).toBeGreaterThan(settled * 2);
  });

  it("narrows the deviation as games are played", () => {
    let me = { ...UNRATED };
    const opponent = { rating: 1500, rd: 60, volatility: 0.06 };
    const before = me.rd;
    for (let i = 0; i < 10; i += 1) {
      me = applyGame(me, opponent, i % 2 === 0 ? "white" : "black").white;
    }
    expect(me.rd).toBeLessThan(before);
    expect(me.rd).toBeLessThan(150);
  });

  it("keeps a rating finite and sane after a long unbeaten run", () => {
    let me = { ...UNRATED };
    const opponent = { rating: 1500, rd: 60, volatility: 0.06 };
    for (let i = 0; i < 100; i += 1) me = applyGame(me, opponent, "white").white;
    expect(Number.isFinite(me.rating)).toBe(true);
    expect(me.rating).toBeGreaterThan(1500);
    expect(me.rating).toBeLessThan(3500);
    expect(me.rd).toBeGreaterThan(0);
  });
});

describe("presentation", () => {
  it("calls a new rating provisional and a settled one not", () => {
    expect(isProvisional(UNRATED.rd)).toBe(true);
    expect(isProvisional(60)).toBe(false);
  });

  it("rounds for display", () => {
    expect(displayRating(1464.06)).toBe(1464);
    expect(displayRating(1499.5)).toBe(1500);
  });
});
