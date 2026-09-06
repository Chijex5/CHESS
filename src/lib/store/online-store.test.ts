import { describe, expect, it } from "vitest";
import { connectionBars, useOnline } from "./online-store";

const T = 1_700_000_000_000;

/* The meter is the only thing on the online board that claims to know something about
   the world outside the tab, so it is worth being precise about when it is guessing. */
describe("connectionBars", () => {
  it("says nothing bad before the first message has arrived", () => {
    expect(
      connectionBars({ connection: "connecting", lastBeatAt: 0, rttMs: null, now: T }),
    ).toBe(3);
  });

  it("reports a fast, fresh connection as full", () => {
    expect(
      connectionBars({ connection: "live", lastBeatAt: T - 2_000, rttMs: 60, now: T }),
    ).toBe(4);
  });

  it("drops with latency even while messages keep arriving", () => {
    const fresh = { connection: "live" as const, lastBeatAt: T - 1_000, now: T };
    expect(connectionBars({ ...fresh, rttMs: 300 })).toBe(3);
    expect(connectionBars({ ...fresh, rttMs: 700 })).toBe(2);
    expect(connectionBars({ ...fresh, rttMs: 4_000 })).toBe(1);
  });

  it("drops on staleness even when the last round trip was fast", () => {
    // The case a latency-only meter misses: the link was quick, and then went quiet.
    expect(
      connectionBars({ connection: "live", lastBeatAt: T - 30_000, rttMs: 40, now: T }),
    ).toBe(1);
    expect(
      connectionBars({ connection: "live", lastBeatAt: T - 18_000, rttMs: 40, now: T }),
    ).toBe(2);
  });

  it("is empty when the stream is gone", () => {
    expect(
      connectionBars({ connection: "closed", lastBeatAt: T - 1_000, rttMs: 40, now: T }),
    ).toBe(0);
  });
});

describe("round-trip sampling", () => {
  it("reports the best of the window, not the average", () => {
    const store = useOnline.getState();
    store.open("TEST01");
    // The cold start is discarded outright, then the truth about the network.
    for (const ms of [3200, 40, 55, 48]) useOnline.getState().observeRtt(ms);
    expect(useOnline.getState().rttSamples).toEqual([40, 55, 48]);
    expect(useOnline.getState().rttMs).toBe(40);
  });

  it("lets an old spike age out rather than remembering it forever", () => {
    useOnline.getState().open("TEST02");
    useOnline.getState().observeRtt(999); // discarded as the cold first sample
    useOnline.getState().observeRtt(30);
    for (const ms of [800, 900, 850, 880, 910]) useOnline.getState().observeRtt(ms);
    // The 30ms sample has left the five-deep window, so the meter degrades honestly.
    expect(useOnline.getState().rttMs).toBe(800);
  });
});

describe("the cold first sample", () => {
  it("is thrown away rather than reported", () => {
    useOnline.getState().open("TEST03");
    useOnline.getState().observeRtt(2_400);
    expect(useOnline.getState().rttMs).toBeNull();
    expect(useOnline.getState().rttSamples).toEqual([]);
    // Unmeasured reads as "assume fine" rather than as a bad connection.
    expect(
      connectionBars({
        connection: "live",
        lastBeatAt: Date.now(),
        rttMs: useOnline.getState().rttMs,
      }),
    ).toBe(3);
  });
});
