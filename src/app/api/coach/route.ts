import { streamText } from "ai";
import { retrieveConcepts } from "@/lib/coach/retrieval";
import {
  buildHintPrompt,
  buildUserPrompt,
  hintSystemPrompt,
  modelFor,
  systemPrompt,
  type Level,
  type Verbosity,
} from "@/lib/coach/prompt";
import type { Annotation, Side } from "@/lib/chess/types";
import { ensurePlayer } from "@/lib/multiplayer/players";
import { gameRow, moveRowsForGame } from "@/lib/multiplayer/games";
import { normaliseGameId } from "@/lib/multiplayer/ids";
import { replay } from "@/lib/multiplayer/rules";
import { canUseDeveloperAssistance } from "@/lib/multiplayer/developer-assistance";

export const maxDuration = 60;

/* Two shapes, one endpoint. An annotation looks backwards at a move that was
   played; a hint looks forwards at one that has not been. They share retrieval,
   the transport and the model, and differ only in the prompt — which is exactly
   the amount of difference that does not justify a second route. */
type Body =
  | { kind?: "annotation"; annotation: Annotation; verbosity?: Verbosity; level?: Level }
  | {
      kind: "hint";
      fen: string;
      bestSan: string;
      side: Side;
      quality?: string;
      level?: Level;
      /** Present only for a live developer-assisted online hint. */
      onlineGameId?: string;
    };

/* Newline-delimited JSON rather than the AI SDK's chat protocol: annotations are
   per-ply and several can be in flight at once, which a single linear chat
   transport cannot express. The SDK still does the work server-side. */
function line(event: Record<string, unknown>) {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The coach model is unavailable.";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const level: Level = body.level ?? "improving";

  /* Narrowed once, here. Everything downstream reads `job` and never has to know
     which shape arrived — a discriminant checked into a boolean does not narrow a
     union, and re-checking it at every use site is how these handlers rot. */
  let job:
    | { hint: false; annotation: Annotation; verbosity: Verbosity }
    | { hint: true; fen: string; bestSan: string; side: Side };

  if (body.kind === "hint") {
    if (!body.fen || !body.bestSan) return new Response("Missing position", { status: 400 });
    if (body.onlineGameId) {
      const player = await ensurePlayer();
      const game = await gameRow(normaliseGameId(body.onlineGameId));
      if (!player || !game || !canUseDeveloperAssistance({
        userId: player.id,
        whiteId: game.whiteId,
        blackId: game.blackId,
        status: game.status,
      })) {
        return new Response("Developer assistance is not available", { status: 403 });
      }
      const rows = await moveRowsForGame(game.id);
      if (replay(rows.map((row) => row.san)).board.fen() !== body.fen) {
        return new Response("Position is out of date", { status: 409 });
      }
    }
    job = { hint: true, fen: body.fen, bestSan: body.bestSan, side: body.side };
  } else {
    if (!body.annotation?.fenBefore || !body.annotation?.playedSan) {
      return new Response("Missing annotation", { status: 400 });
    }
    job = {
      hint: false,
      annotation: body.annotation,
      // A hint is always short; only a "deep" annotation is worth reaching for Flash.
      verbosity: body.verbosity ?? "standard",
    };
  }

  /* Checked here rather than left to the provider: without a key Google answers
     "Method doesn't allow unregistered callers", which sends whoever is setting
     this up looking for an auth bug instead of an empty line in .env. */
  const configured = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: Record<string, unknown>) => controller.enqueue(line(event));
      try {
        // Synchronous: retrieval is a ranking pass over an in-process corpus,
        // so the concepts reach the client before the model has produced a token.
        const concepts = retrieveConcepts(
          job.hint
            ? { fenBefore: job.fen, bestSan: job.bestSan, quality: "best" }
            : {
                fenBefore: job.annotation.fenBefore,
                playedSan: job.annotation.playedSan,
                bestSan: job.annotation.bestSan,
                quality: job.annotation.quality,
              },
        );
        push({ type: "concepts", concepts });

        // The concepts above are worth sending either way — they cost nothing and
        // the card renders them next to the engine's own facts.
        if (!configured) {
          push({
            type: "error",
            message:
              "GOOGLE_GENERATIVE_AI_API_KEY is not set. Get a free key at " +
              "https://aistudio.google.com/apikey and add it to .env.",
          });
          return;
        }

        const verbosity: Verbosity = job.hint ? "terse" : job.verbosity;

        /* One attempt. Returns the failure rather than throwing, and reports
           whether anything was written — a stream that has already emitted text
           cannot be retried on another model without the reader seeing two
           different explanations spliced together.

           `textStream` silently drops provider `error` parts, which turns a bad
           credential into an empty explanation. Reading the full part stream
           means a failure is reported instead of looking like success. */
        const attempt = async (modelVerbosity: Verbosity) => {
          const result = streamText({
            model: modelFor(modelVerbosity),
            system: job.hint ? hintSystemPrompt(level) : systemPrompt(level),
            prompt: job.hint
              ? buildHintPrompt(
                  { fen: job.fen, bestSan: job.bestSan, side: job.side },
                  concepts,
                )
              : buildUserPrompt(job.annotation, concepts, verbosity),
            temperature: 0.3,
            abortSignal: request.signal,
          });

          let wrote = false;
          for await (const part of result.stream) {
            if (part.type === "text-delta") {
              wrote = true;
              push({ type: "delta", text: part.text });
            } else if (part.type === "error") {
              return { failure: errorMessage(part.error), wrote };
            }
          }
          return { failure: null as string | null, wrote };
        };

        const first = await attempt(verbosity);
        let failure = first.failure;

        /* Flash is the only model here that is not free on every tier, and on the
           free tier it periodically answers "experiencing high demand". Falling
           back to Flash-Lite turns that into a shorter explanation rather than no
           explanation — but only while nothing has been written yet. */
        if (failure && !first.wrote && verbosity === "deep") {
          ({ failure } = await attempt("standard"));
        }

        if (failure) push({ type: "error", message: failure });
        else push({ type: "done" });
      } catch (error) {
        const message = (error as Error)?.message ?? "Coach unavailable";
        push({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
