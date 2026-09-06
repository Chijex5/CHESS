import { auth } from "@clerk/nextjs/server";
import { gameRow, snapshot } from "@/lib/multiplayer/games";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { subscribe } from "@/lib/realtime/bus";
import type { ServerEvent } from "@/lib/multiplayer/protocol";

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
      /* The client's own cursor, so a resumed stream is told only what it missed.
         Sent by the browser automatically after a drop. */
      let sent = Number(request.headers.get("last-event-id") ?? 0);

      const send = (event: ServerEvent, eventId?: number) => {
        if (!open) return;
        try {
          const prefix = eventId === undefined ? "" : `id: ${eventId}\n`;
          controller.enqueue(encoder.encode(`${prefix}data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      /* Always a snapshot first, on a fresh connect and on every resume. It costs
         one query and removes a whole class of bug: there is no path where a client
         is drawing a board it assembled from events alone. */
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
        if (state.seq !== sent || state.status !== "active") {
          sent = state.seq;
          send({ type: "snapshot", snapshot: state }, state.seq);
        }
        if (state.status === "finished" || state.status === "abandoned") {
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
