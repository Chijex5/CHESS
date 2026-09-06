import { auth } from "@clerk/nextjs/server";
import { gameRow, snapshot } from "@/lib/multiplayer/games";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { subscribe } from "@/lib/realtime/bus";
import type { GameSnapshot, ServerEvent } from "@/lib/multiplayer/protocol";

/* One long-lived function per connected player. 300s is the Hobby ceiling and the
   stream is designed to be cut off: the browser reconnects on its own, sends
   `Last-Event-ID`, and the reconnect is indistinguishable from the first connect
   because both begin with a snapshot. */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Long enough not to matter, short enough that a dead connection is noticed and a
 *  Redis-less deployment still progresses. */
const HEARTBEAT_MS = 10_000;

/* Server-Sent Events rather than a WebSocket. Chess is asymmetric — a move goes up
   once in a while as a plain POST, and the stream only ever comes down — so the
   upgrade handshake would buy bidirectionality nothing uses, while browsers give us
   reconnection and `Last-Event-ID` resume for free. */
/**
 * Everything a client's rendering depends on, in one comparable string.
 *
 * Anything a board, a clock or a status line reads has to appear here, or a change to
 * it will not be sent. That is the failure the sequence-number version had, so the
 * rule is: if the UI reads it, it is in this string.
 */
function fingerprintOf(state: GameSnapshot): string {
  return [
    state.status,
    state.seq,
    state.white?.username ?? "",
    state.black?.username ?? "",
    state.winner ?? "",
    state.ending ?? "",
    state.offer ? `${state.offer.kind}:${state.offer.by}` : "",
    /* Ratings land a moment after the result, in a second write. Without them here the
       dialog would show "working out the new ratings…" until something else changed —
       which, the game being over, is never. */
    state.ratings ? `${state.ratings.white.after}:${state.ratings.black.after}` : "",
    // The clock's fixed point. It moves when a game starts and when a move lands, and
    // a client projecting from a stale one shows the wrong time.
    state.turnStartedAt,
  ].join("|");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: raw } = await params;
  const id = normaliseGameId(raw);
  const { userId } = await auth();

  if (!(await gameRow(id))) {
    return new Response("no such game", { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      /* What the client has already been told, as a fingerprint of everything a board
         is drawn from. Not a sequence number: the first version of this gated on
         `seq !== sent || status !== "active"`, and a game going pending → active with
         no moves played changes neither — so the host was never told their opponent
         had arrived, and a reconnect was never told anything at all and waited
         forever. Meanwhile the server was already running their clock. */
      let fingerprint = "";

      const send = (event: ServerEvent, eventId?: number) => {
        if (!open) return;
        try {
          const prefix = eventId === undefined ? "" : `id: ${eventId}\n`;
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      /* Always a snapshot, never a delta. It costs one query and removes a whole
         class of bug: there is no path where a client draws a board it assembled from
         events alone, so a fresh connect and a resume are the same code. */
      const push = async () => {
        const state = await snapshot(id, userId ?? null);
        if (!state) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed.
          }
          return;
        }

        const next = fingerprintOf(state);
        if (next !== fingerprint) {
          fingerprint = next;
          send({ type: "snapshot", snapshot: state }, state.seq);
        }

        /* Closed once there is provably nothing left to send. A rated game writes its
           ratings a moment *after* the result, in a second statement, so closing on
           `finished` alone would shut the door before the numbers arrived and leave the
           dialog saying "working out the new ratings…" for good. */
        const settled =
          state.status === "abandoned" ||
          (state.status === "finished" && (!state.rated || state.ratings !== null));
        if (settled) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        }
      };

      await push();

      /* The doorbell only says "go and look", so the handler ignores the sequence it
         is given and re-reads. That is what makes a dropped message harmless. */
      const unsubscribe = await subscribe(id, () => {
        void push();
      });

      const beat = setInterval(() => {
        if (!open) return;
        // Doubles as the fallback when Redis is absent: every tick re-reads, so a
        // deployment with no REDIS_URL is a polling deployment rather than a broken
        // one.
        send({ type: "ping", now: Date.now() });
        void push();
      }, HEARTBEAT_MS);

      const shutdown = () => {
        open = false;
        clearInterval(beat);
        void unsubscribe();
      };

      request.signal.addEventListener("abort", shutdown);
      // The platform kills the function at `maxDuration`; closing a little early
      // means the client reconnects on a clean close rather than a truncated one.
      setTimeout(() => {
        shutdown();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }, (maxDuration - 5) * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Tells any intermediary proxy not to buffer, which would defeat the point.
      "x-accel-buffering": "no",
    },
  });
}
