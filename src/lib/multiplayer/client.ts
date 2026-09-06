"use client";

import { useOnline } from "@/lib/store/online-store";
import type { GameSnapshot, MoveRequest, ServerEvent } from "./protocol";

/* ── The client half ──────────────────────────────────────────────────────────
   Moves go up as plain POSTs and state comes down over SSE. The only interesting
   part is what happens when they disagree: the server always wins, and the client
   is built so that losing costs a redraw rather than a desync.
   ─────────────────────────────────────────────────────────────────────────── */

export async function fetchSnapshot(gameId: string): Promise<GameSnapshot | null> {
  const response = await fetch(`/api/game/${gameId}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as GameSnapshot;
}

/** Sits down at a pending game. Returns the snapshot, seated or not. */
export async function joinGame(gameId: string): Promise<GameSnapshot | null> {
  const response = await fetch(`/api/game/${gameId}`, { method: "POST" });
  if (response.status === 401) return null;
  const body = await response.json().catch(() => null);
  return (body as GameSnapshot) ?? null;
}

export async function createGame(input: {
  side: "white" | "black" | "random";
  timeControl: string;
}): Promise<string | null> {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) return null;
  const { id } = (await response.json()) as { id: string };
  return id;
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
  const response = await fetch(`/api/game/${gameId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, reason: body?.error ?? "rejected" };
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
    }
    // `ping` needs no handling: its only job is to prove the socket is alive, and
    // the server re-reads the game on the same tick.
  };

  source.onerror = () => {
    /* CLOSED means the browser has stopped trying — which the server does
       deliberately when a game finishes. Anything else is a gap it will close. */
    useOnline
      .getState()
      .setConnection(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
  };

  return () => {
    source.close();
    useOnline.getState().close();
  };
}
