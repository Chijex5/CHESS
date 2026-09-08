import type { Seat } from "./protocol";

/* ── Chat, the parts worth testing ────────────────────────────────────────────
   Two people, one game, and no moderator. That last fact decides the design: with
   nobody reading reports, the controls that actually protect somebody are the ones
   they hold themselves — block, which is mutual in effect and never announced, and
   mute, which is local and also never announced. A report queue would be a button
   that does nothing.

   What is left for the server is keeping a message from being a weapon by volume: a
   length nobody can wall you with, and a rate nobody can flood you at.
   ─────────────────────────────────────────────────────────────────────────── */

/** Long enough for a sentence, short enough that it cannot be used as a wall. */
export const MAX_BODY = 200;

/** Ten messages in thirty seconds. Generous for two people talking, useless for
 *  flooding — and counted from the stored rows, so it holds with Redis down. */
export const RATE_LIMIT = { messages: 10, windowMs: 30_000 };

export type ChatLine = {
  id: number;
  seat: Seat;
  body: string;
  at: number;
};

/**
 * Cleans a message, or refuses it.
 *
 * Newlines collapse to spaces rather than being kept: a chat line is one line, and
 * allowing twenty of them is a way to take over the panel without exceeding the
 * character cap. Control characters go for the same reason — a run of them renders as
 * nothing and can pad a message past anything that counts visible text.
 */
export function cleanBody(raw: unknown): { ok: true; body: string } | { ok: false; reason: string } {
  if (typeof raw !== "string") return { ok: false, reason: "bad-message" };
  const body = raw
    /* Control characters first, then whitespace. Both collapse to a single space, so a
       message cannot smuggle twenty newlines past a character cap and take over the
       panel, and a run of invisible characters cannot pad one either. */
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (body.length === 0) return { ok: false, reason: "empty" };
  if (body.length > MAX_BODY) return { ok: false, reason: "too-long" };
  return { ok: true, body };
}

/**
 * Whether another message is allowed, given when the recent ones were sent.
 *
 * Takes timestamps rather than reading a store, so the rule is one comparison a test
 * can make directly. `sentAt` values outside the window are ignored rather than
 * assumed absent — the caller may pass more rows than the window covers.
 */
export function withinRateLimit(sentAt: number[], now: number): boolean {
  const since = now - RATE_LIMIT.windowMs;
  const recent = sentAt.filter((time) => time > since);
  return recent.length < RATE_LIMIT.messages;
}

/**
 * Whether chat is open on a game in this state.
 *
 * Open through the rematch window as well as during play, because the most common
 * thing anyone says is "good game" and it is said after the result. Tied to the same
 * deadline as the rematch offer, so the panel and the stream close together rather
 * than leaving a box that accepts messages nobody will receive.
 */
export function chatOpen(
  game: { status: string; endedAt: number | null },
  now: number,
  windowMs: number,
): boolean {
  if (game.status === "active") return true;
  if (game.status !== "finished") return false;
  return game.endedAt !== null && now - game.endedAt <= windowMs;
}
