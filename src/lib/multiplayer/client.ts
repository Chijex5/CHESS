"use client";

import { serverNow, useOnline } from "@/lib/store/online-store";
import type { ChatLine } from "./chat";
import {
  rematchPhase,
  streamSettled,
  type GameSnapshot,
  type MoveRequest,
  type ServerEvent,
} from "./protocol";

/* ── The client half ──────────────────────────────────────────────────────────
   Moves go up as plain POSTs and state comes down over SSE. The only interesting
   part is what happens when they disagree: the server always wins, and the client
   is built so that losing costs a redraw rather than a desync.
   ─────────────────────────────────────────────────────────────────────────── */

/** Times a request and records the round trip. Every fetch the client already makes
 *  is a latency sample, so the connection meter costs no extra traffic. */
async function timed(input: string, init?: RequestInit): Promise<Response> {
  const started = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    useOnline.getState().observeRtt(Math.round(performance.now() - started));
  }
}

export async function fetchSnapshot(gameId: string): Promise<GameSnapshot | null> {
  const response = await timed(`/api/game/${gameId}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as GameSnapshot;
}

/** Sits down at a pending game. Returns the snapshot, seated or not. */
export async function joinGame(gameId: string): Promise<GameSnapshot | null> {
  const response = await timed(`/api/game/${gameId}`, { method: "POST" });
  if (response.status === 401) return null;
  const body = await response.json().catch(() => null);
  return (body as GameSnapshot) ?? null;
}

export async function createGame(input: {
  side: "white" | "black" | "random";
  timeControl: string;
  /** Addresses the game to one player by username, so only they can sit down. */
  invite?: string;
}): Promise<{ id: string } | { error: string }> {
  const response = await timed("/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as
    | { id?: string; error?: string }
    | null;
  if (!response.ok || !body?.id) return { error: body?.error ?? "failed" };
  return { id: body.id };
}

/**
 * Proposes something to the other player: a draw, a resignation, a rematch.
 *
 * Returns the rematch destination when one has been agreed, which is how the accepting
 * client gets there without waiting for its own event stream to come back around.
 */
export async function sendOffer(
  gameId: string,
  action: string,
): Promise<{ ok: true; rematchId: string | null } | { ok: false; reason: string }> {
  const response = await timed(`/api/game/${gameId}/offer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string; rematchId?: string | null }
    | null;
  if (!response.ok) return { ok: false, reason: body?.error ?? "rejected" };
  return { ok: true, rematchId: body?.rematchId ?? null };
}

/** Everything said after `after`. The cursor comes off the snapshot, so this is only
 *  ever called when there is something to collect. */
export async function fetchChat(gameId: string, after: number): Promise<ChatLine[]> {
  const response = await timed(`/api/game/${gameId}/chat?after=${after}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as { lines?: ChatLine[] } | null;
  return body?.lines ?? [];
}

export async function sendChat(
  gameId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const response = await timed(`/api/game/${gameId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (response.ok) return { ok: true };
  const failed = (await response.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, reason: failed?.error ?? "rejected" };
}

/**
 * Sends a move.
 *
 * Returns the refusal reason on failure so the caller can say something specific.
 * It does not itself repair the board: the event stream is about to deliver a
 * snapshot that supersedes whatever the client believed, and having two things race
 * to correct the same state is how desyncs are made.
 */
export async function sendMove(
  gameId: string,
  request: MoveRequest,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const response = await timed(`/api/game/${gameId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, reason: body?.error ?? "rejected" };
}

export async function sendEngineMove(gameId: string, request: MoveRequest) {
  const response = await timed(`/api/game/${gameId}/engine-move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return response.ok;
}

/**
 * Connects the event stream and keeps it connected.
 *
 * `EventSource` reconnects on its own and resends `Last-Event-ID`, so there is no
 * backoff to write — but it gives up silently on some errors, so the readyState is
 * reflected into the store and the UI can say "reconnecting" rather than freezing
 * with a stale board.
 */
export function connect(gameId: string): () => void {
  const store = useOnline.getState();
  store.open(gameId);

  const source = new EventSource(`/api/game/${gameId}/events`);
  let polling: ReturnType<typeof setTimeout> | undefined;
  let live = true;

  /* `EventSource` reads a clean end of stream as a reason to reconnect, so a finished
     game would otherwise be reopened every few seconds for as long as the tab stayed
     open — each time to be told the same result and closed again. The client stops on
     the same predicate the server closes on, which is why that predicate is shared
     rather than written twice. */
  /* The snapshot advertises a cursor; this collects what it points past. Guarded on the
     client's own high-water mark rather than on the previous snapshot, so a reconnect
     that starts from a fresh store fetches the conversation once and no more. */
  const catchUpChat = (snapshot: GameSnapshot) => {
    const held = useOnline.getState().chat;
    const have = held.length === 0 ? 0 : held[held.length - 1].id;
    if (snapshot.chatSeq <= have) return;
    void fetchChat(gameId, have).then((lines) => {
      if (live && lines.length > 0) useOnline.getState().addChat(lines);
    });
  };

  const stopIfDone = (snapshot: GameSnapshot) => {
    if (!streamSettled(snapshot, serverNow())) return;
    live = false;
    clearTimeout(polling);
    source.close();
    useOnline.getState().setConnection("closed");
  };

  /* One timed fetch on connect, and one on a timer after.
     `EventSource` cannot be timed — the browser owns the request — so without this the
     connection meter would have no round trip to report until the player happened to
     move, and would sit at its "assume fine" default all game. The snapshot it returns
     also paints the board a beat sooner than the first SSE message would. */
  const measure = () =>
    void fetchSnapshot(gameId).then((snapshot) => {
      if (!snapshot || !live) return;
      useOnline.getState().applySnapshot(snapshot);
      catchUpChat(snapshot);
      stopIfDone(snapshot);
    });

  /* Half a minute is plenty to keep a latency sample fresh, and two requests a minute
     is a rounding error next to the stream itself. The exception is a rematch offer
     you are waiting on: the answer is a page navigation, and if Redis is down the only
     thing that would deliver it is the ten-second heartbeat — ten seconds of the
     opponent's clock, which in a blitz rematch is a real amount of the game. */
  const nextPoll = () => {
    const snapshot = useOnline.getState().snapshot;
    const waiting = snapshot
      ? rematchPhase(snapshot, serverNow()) === "offered"
      : false;
    return waiting ? 1_500 : 30_000;
  };

  const schedule = () => {
    if (!live) return;
    polling = setTimeout(() => {
      measure();
      schedule();
    }, nextPoll());
  };

  measure();
  schedule();

  source.onopen = () => useOnline.getState().setConnection("live");

  source.onmessage = (message) => {
    let event: ServerEvent;
    try {
      event = JSON.parse(message.data) as ServerEvent;
    } catch {
      return;
    }
    if (event.type === "snapshot") {
      useOnline.getState().applySnapshot(event.snapshot);
      catchUpChat(event.snapshot);
      stopIfDone(event.snapshot);
      return;
    }
    /* A ping carries no state — its whole job is to be evidence that the stream is
       alive, which a turn-based game has no other source of while both players
       think. */
    useOnline.getState().beat();
  };

  source.onerror = () => {
    /* CLOSED means nothing is going to reconnect: either the browser has given up, or
       `stopIfDone` shut the stream because the game has no more to say. Anything else
       is a gap the browser will close on its own. */
    useOnline
      .getState()
      .setConnection(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
  };

  return () => {
    live = false;
    clearTimeout(polling);
    source.close();
    useOnline.getState().close();
  };
}
