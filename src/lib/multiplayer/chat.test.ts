import { describe, expect, it } from "vitest";
import { MAX_BODY, chatOpen, cleanBody, withinRateLimit } from "./chat";

const T = 1_700_000_000_000;
const WINDOW = 120_000;

describe("cleanBody", () => {
  it("keeps an ordinary message", () => {
    expect(cleanBody("good game")).toEqual({ ok: true, body: "good game" });
  });

  it("collapses newlines rather than keeping them", () => {
    /* Twenty newlines is a way to take over the panel while staying well inside the
       character cap, so a chat line is one line by the time it is stored. */
    expect(cleanBody("well\n\n\nplayed")).toEqual({ ok: true, body: "well played" });
  });

  it("strips control characters", () => {
    // A run of these renders as nothing and pads a message past any visible-text count.
    expect(cleanBody("hi\u0000\u0007\u007Fthere")).toEqual({ ok: true, body: "hi there" });
  });

  it("refuses an empty message, and whitespace is empty", () => {
    expect(cleanBody("")).toMatchObject({ ok: false, reason: "empty" });
    expect(cleanBody("   \n\t ")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("refuses anything over the cap", () => {
    expect(cleanBody("a".repeat(MAX_BODY))).toMatchObject({ ok: true });
    expect(cleanBody("a".repeat(MAX_BODY + 1))).toMatchObject({
      ok: false,
      reason: "too-long",
    });
  });

  it("refuses a body that is not a string at all", () => {
    expect(cleanBody(undefined)).toMatchObject({ ok: false });
    expect(cleanBody({ toString: () => "sneaky" })).toMatchObject({ ok: false });
  });
});

describe("withinRateLimit", () => {
  it("allows a conversation", () => {
    const recent = [T - 1_000, T - 5_000, T - 20_000];
    expect(withinRateLimit(recent, T)).toBe(true);
  });

  it("stops the tenth message inside the window", () => {
    const flood = Array.from({ length: 10 }, (_, i) => T - i * 100);
    expect(withinRateLimit(flood, T)).toBe(false);
  });

  it("ignores messages older than the window", () => {
    // Ten messages, but a minute ago: the window has moved on.
    const old = Array.from({ length: 10 }, (_, i) => T - 60_000 - i * 100);
    expect(withinRateLimit(old, T)).toBe(true);
  });

  it("allows the first message", () => {
    expect(withinRateLimit([], T)).toBe(true);
  });
});

describe("chatOpen", () => {
  it("is open during a game", () => {
    expect(chatOpen({ status: "active", endedAt: null }, T, WINDOW)).toBe(true);
  });

  it("stays open through the rematch window", () => {
    /* The most common thing anyone says is "good game", and it is said after the
       result. Tied to the same deadline as the rematch offer so the box and the stream
       that carries it close together. */
    expect(chatOpen({ status: "finished", endedAt: T - 1_000 }, T, WINDOW)).toBe(true);
    expect(chatOpen({ status: "finished", endedAt: T - WINDOW - 1 }, T, WINDOW)).toBe(false);
  });

  it("is shut before anyone has sat down, and on an abandoned game", () => {
    expect(chatOpen({ status: "pending", endedAt: null }, T, WINDOW)).toBe(false);
    expect(chatOpen({ status: "abandoned", endedAt: null }, T, WINDOW)).toBe(false);
  });

  it("is shut on a finished game that cannot be dated", () => {
    expect(chatOpen({ status: "finished", endedAt: null }, T, WINDOW)).toBe(false);
  });
});
