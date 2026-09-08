import { describe, expect, it } from "vitest";
import { smooth, speedOf, statistics, winRate } from "./statistics";
import { EMPTY_TALLY, type GameSummary } from "@/lib/archive/types";

const DAY = 86_400_000;
const T = 1_700_000_000_000;

let n = 0;

/** A finished game. Analysed unless `accuracy` is explicitly null. */
function game(overrides: Partial<GameSummary> = {}): GameSummary {
  n += 1;
  return {
    id: `G${n}`,
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
    qualities: { ...EMPTY_TALLY, best: 12, good: 6, blunder: 1 },
    hinted: 0,
    concepts: { fork: 1 },
    ...overrides,
  };
}

describe("speedOf", () => {
  it("bands by the conventional bounds", () => {
    expect(speedOf(0)).toBe("untimed");
    expect(speedOf(120_000)).toBe("bullet");
    expect(speedOf(180_000)).toBe("blitz");
    expect(speedOf(300_000)).toBe("blitz");
    expect(speedOf(600_000)).toBe("rapid");
    expect(speedOf(1_800_000)).toBe("classical");
  });
});

describe("winRate", () => {
  it("keeps draws in the denominator", () => {
    /* Otherwise a player who never loses can climb towards 100% by drawing, which
       reads as dominance and is the opposite. */
    expect(winRate({ wins: 1, losses: 0, draws: 1, games: 2 })).toBe(0.5);
  });

  it("is null with nothing played, rather than zero", () => {
    expect(winRate({ wins: 0, losses: 0, draws: 0, games: 0 })).toBeNull();
  });
});

describe("statistics", () => {
  it("splits the record by colour, source and speed", () => {
    const stats = statistics([
      game({ side: "white", outcome: "win" }),
      game({ side: "black", outcome: "loss" }),
      game({ side: "black", outcome: "draw", source: "online", initialMs: 180_000 }),
    ]);

    expect(stats.record).toEqual({ wins: 1, losses: 1, draws: 1, games: 3 });
    expect(stats.byColour.white).toMatchObject({ wins: 1, games: 1 });
    expect(stats.byColour.black).toMatchObject({ losses: 1, draws: 1, games: 2 });
    expect(stats.bySource.online).toMatchObject({ games: 1 });
    expect(stats.bySpeed.map((row) => row.speed)).toEqual(["blitz", "rapid"]);
  });

  it("counts an unanalysed game in the record and nowhere else", () => {
    /* The common case for an online game: the server files the result the moment it
       ends, and nothing has run the engine over it. Averaging it in as zero accuracy
       would report a standard of play nobody produced. */
    const stats = statistics([
      game({ accuracy: 90, qualities: { ...EMPTY_TALLY, blunder: 0 }, concepts: {} }),
      game({ accuracy: null, qualities: null, concepts: null, hinted: null }),
    ]);

    expect(stats.record.games).toBe(2);
    expect(stats.analysed).toBe(1);
    expect(stats.accuracy.mean).toBe(90);
    expect(stats.accuracy.points).toHaveLength(1);
    expect(stats.perGame?.blunders).toBe(0);
  });

  it("has no accuracy at all before anything is analysed", () => {
    const stats = statistics([game({ accuracy: null, qualities: null, concepts: null })]);
    expect(stats.accuracy.mean).toBeNull();
    expect(stats.perGame).toBeNull();
  });

  it("ranks a weakness by the games it spans before the times it occurred", () => {
    /* Three games with one loose piece each is a habit worth naming. One game with
       four is a bad afternoon, and a count-only ranking cannot tell them apart. */
    const stats = statistics([
      game({ concepts: { "loose-piece": 1, fork: 4 } }),
      game({ concepts: { "loose-piece": 1 } }),
      game({ concepts: { "loose-piece": 1 } }),
    ]);

    expect(stats.weaknesses[0]).toEqual({ slug: "loose-piece", count: 3, games: 3 });
    expect(stats.weaknesses[1]).toEqual({ slug: "fork", count: 4, games: 1 });
  });

  it("tells how wins arrive from how losses do", () => {
    const stats = statistics([
      game({ outcome: "win", ending: "checkmate" }),
      game({ outcome: "win", ending: "resignation" }),
      game({ outcome: "loss", ending: "timeout" }),
      // A draw belongs to neither story.
      game({ outcome: "draw", ending: "agreement" }),
    ]);

    expect(stats.endings.wins).toEqual({ checkmate: 1, resignation: 1 });
    expect(stats.endings.losses).toEqual({ timeout: 1 });
  });

  it("reads the streak from the most recent game backwards", () => {
    const stats = statistics([
      game({ playedAt: T, outcome: "loss" }),
      game({ playedAt: T + DAY, outcome: "win" }),
      game({ playedAt: T + 2 * DAY, outcome: "win" }),
    ]);
    expect(stats.streak).toBe(2);

    // Order in, order out: the input is sorted here rather than trusted.
    const reversed = statistics([
      game({ playedAt: T + 2 * DAY, outcome: "loss" }),
      game({ playedAt: T, outcome: "win" }),
      game({ playedAt: T + DAY, outcome: "loss" }),
    ]);
    expect(reversed.streak).toBe(-2);
  });

  it("ends a streak on a draw", () => {
    const stats = statistics([
      game({ playedAt: T, outcome: "win" }),
      game({ playedAt: T + DAY, outcome: "draw" }),
    ]);
    expect(stats.streak).toBe(0);
  });

  it("groups openings by the first three plies", () => {
    const stats = statistics([
      game({ firstMoves: "e4 e5 Nf3", outcome: "win" }),
      game({ firstMoves: "e4 e5 Nf3", outcome: "loss" }),
      game({ firstMoves: "d4 d5 c4", outcome: "win" }),
      // A game too short to have three plies is not an opening.
      game({ firstMoves: "" }),
    ]);

    expect(stats.openings[0]).toEqual({
      moves: "e4 e5 Nf3",
      record: { wins: 1, losses: 1, draws: 0, games: 2 },
    });
    expect(stats.openings).toHaveLength(2);
  });

  it("sums your own move bands across every analysed game", () => {
    const stats = statistics([
      game({ qualities: { ...EMPTY_TALLY, best: 10, blunder: 2 } }),
      game({ qualities: { ...EMPTY_TALLY, best: 5, mistake: 1 } }),
    ]);
    expect(stats.qualities.best).toBe(15);
    expect(stats.qualities.blunder).toBe(2);
    expect(stats.perGame).toEqual({ blunders: 1, mistakes: 0.5, inaccuracies: 0 });
  });

  it("reports nothing rather than zeroes for an empty archive", () => {
    const stats = statistics([]);
    expect(stats.record.games).toBe(0);
    expect(stats.accuracy.mean).toBeNull();
    expect(stats.weaknesses).toEqual([]);
    expect(stats.streak).toBe(0);
  });
});

describe("smooth", () => {
  it("clamps the window to the sample count", () => {
    // Four games should still draw a line rather than nothing.
    const points = [
      { playedAt: T, accuracy: 60 },
      { playedAt: T + DAY, accuracy: 80 },
    ];
    expect(smooth(points, 5)).toEqual([
      { playedAt: T, accuracy: 60 },
      { playedAt: T + DAY, accuracy: 70 },
    ]);
  });

  it("is empty for no points", () => {
    expect(smooth([])).toEqual([]);
  });
});
