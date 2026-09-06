import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import {
  endingOf,
  flagged,
  judgeMove,
  liveRemaining,
  remaining,
  replay,
  resignResult,
  timeoutResult,
  type StoredMove,
} from "./rules";

const BLITZ = { initialMs: 180_000, incrementMs: 0 };
const NO_CLOCK = { initialMs: 0, incrementMs: 0 };
const T0 = 1_700_000_000_000;

/** A move as the server would have stored it. */
function stored(seq: number, san: string, white: number, black: number, at: number): StoredMove {
  return { seq, san, msLeftWhite: white, msLeftBlack: black, playedAt: at };
}

function attempt(over: Partial<Parameters<typeof judgeMove>[0]> = {}) {
  return judgeMove({
    sans: [],
    clock: BLITZ,
    seat: "white",
    from: "e2",
    to: "e4",
    expectedSeq: 1,
    now: T0 + 5_000,
    turnStartedAt: T0,
    last: null,
    ...over,
  });
}

describe("judgeMove", () => {
  it("accepts a legal opening move and charges the thinking time", () => {
    const verdict = attempt();
    expect(verdict).toMatchObject({ ok: true, san: "e4", uci: "e2e4", seq: 1 });
    if (!verdict.ok) return;
    // Five seconds spent, no increment.
    expect(verdict.msLeftWhite).toBe(175_000);
    expect(verdict.msLeftBlack).toBe(180_000);
    expect(verdict.ending).toBeNull();
  });

  it("refuses a move from the side not on the move", () => {
    expect(attempt({ seat: "black" })).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("refuses an illegal move", () => {
    expect(attempt({ from: "e2", to: "e5" })).toEqual({
      ok: false,
      reason: "illegal-move",
    });
  });

  it("refuses a move that is not the next ply", () => {
    // The retry case: a client resends ply 1 after the response was lost.
    expect(attempt({ sans: ["e4"], seat: "black", expectedSeq: 1 })).toEqual({
      ok: false,
      reason: "out-of-sequence",
    });
    // And a client that has run ahead.
    expect(attempt({ expectedSeq: 2 })).toEqual({ ok: false, reason: "out-of-sequence" });
  });

  it("refuses a move from a player whose clock has already run out", () => {
    expect(
      attempt({
        last: stored(2, "Nc6", 4_000, 180_000, T0),
        sans: ["e4", "e5"],
        expectedSeq: 3,
        now: T0 + 4_001,
      }),
    ).toEqual({ ok: false, reason: "flagged" });
  });

  it("adds the increment after deducting the time spent", () => {
    const verdict = attempt({
      clock: { initialMs: 180_000, incrementMs: 10_000 },
      now: T0 + 3_000,
    });
    expect(verdict.ok && verdict.msLeftWhite).toBe(187_000);
  });

  it("leaves both clocks alone when there is no clock", () => {
    const verdict = attempt({ clock: NO_CLOCK, now: T0 + 60_000 });
    expect(verdict.ok && verdict.msLeftWhite).toBe(0);
    expect(verdict.ok && verdict.msLeftBlack).toBe(0);
  });

  it("reports checkmate, and names the winner as the side that delivered it", () => {
    // 1.f3 e5 2.g4 Qh4#
    const verdict = judgeMove({
      sans: ["f3", "e5", "g4"],
      clock: NO_CLOCK,
      seat: "black",
      from: "d8",
      to: "h4",
      expectedSeq: 4,
      now: T0,
      turnStartedAt: T0,
      last: null,
    });
    expect(verdict.ok && verdict.ending).toEqual({
      winner: "black",
      ending: "checkmate",
    });
  });

  it("promotes when asked", () => {
    const board = new Chess();
    for (const san of ["e4", "d5", "exd5", "c6", "dxc6", "Nf6", "cxb7", "Ng8"]) {
      board.move(san);
    }
    const verdict = judgeMove({
      sans: board.history(),
      clock: NO_CLOCK,
      seat: "white",
      from: "b7",
      to: "a8",
      promotion: "q",
      expectedSeq: 9,
      now: T0,
      turnStartedAt: T0,
      last: null,
    });
    expect(verdict.ok && verdict.uci).toBe("b7a8q");
    expect(verdict.ok && verdict.san).toContain("=Q");
  });
});

describe("clocks", () => {
  it("starts both sides at the initial time", () => {
    expect(remaining(BLITZ, null)).toEqual({ white: 180_000, black: 180_000 });
  });

  it("reads the last stored pair once a move has been played", () => {
    expect(remaining(BLITZ, stored(1, "e4", 175_000, 180_000, T0))).toEqual({
      white: 175_000,
      black: 180_000,
    });
  });

  it("counts down only the side that is thinking", () => {
    const live = liveRemaining({
      clock: BLITZ,
      last: stored(1, "e4", 175_000, 180_000, T0),
      turn: "black",
      turnStartedAt: T0,
      now: T0 + 7_000,
    });
    expect(live).toEqual({ white: 175_000, black: 173_000 });
  });

  it("never reports a negative clock", () => {
    const live = liveRemaining({
      clock: BLITZ,
      last: stored(1, "e4", 1_000, 500, T0),
      turn: "black",
      turnStartedAt: T0,
      now: T0 + 9_000,
    });
    expect(live.black).toBe(0);
  });

  it("flags the thinking side and nobody else", () => {
    const base = {
      clock: BLITZ,
      last: stored(1, "e4", 1_000, 500, T0),
      turnStartedAt: T0,
    };
    expect(flagged({ ...base, turn: "black", now: T0 + 600 })).toBe("black");
    expect(flagged({ ...base, turn: "black", now: T0 + 100 })).toBeNull();
    // White is low but is not the one on the move.
    expect(flagged({ ...base, turn: "white", now: T0 + 600 })).toBeNull();
  });

  it("never flags an untimed game", () => {
    expect(
      flagged({
        clock: NO_CLOCK,
        last: null,
        turn: "white",
        turnStartedAt: T0,
        now: T0 + 86_400_000,
      }),
    ).toBeNull();
  });
});

describe("endings", () => {
  it("says nothing about a game still in progress", () => {
    expect(endingOf(new Chess())).toBeNull();
  });

  it("recognises a stalemate as a draw", () => {
    // A known stalemate: black to move, no legal move, not in check.
    const board = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(endingOf(board)).toEqual({ winner: "draw", ending: "stalemate" });
  });

  it("recognises bare kings as insufficient material", () => {
    expect(endingOf(new Chess("8/8/4k3/8/8/4K3/8/8 w - - 0 1"))).toEqual({
      winner: "draw",
      ending: "insufficient-material",
    });
  });

  it("hands the win to whoever still has time, and to whoever did not resign", () => {
    expect(timeoutResult("white")).toEqual({ winner: "black", ending: "timeout" });
    expect(resignResult("black")).toEqual({ winner: "white", ending: "resignation" });
  });
});

describe("replay", () => {
  it("returns the position, the side to move and the ply count", () => {
    const position = replay(["e4", "e5", "Nf3"]);
    expect(position.ply).toBe(3);
    expect(position.turn).toBe("black");
    expect(position.board.fen()).toContain(" b ");
  });
});
