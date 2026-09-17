"use client";

import { useCoach } from "@/lib/store/coach-store";
import { useHint } from "@/lib/store/hint-store";
import { playCue } from "@/lib/audio/sfx";
import type { Settings } from "@/lib/store/settings-store";
import type { Annotation, Concept, Side } from "@/lib/chess/types";

type Event =
  | { type: "concepts"; concepts: Concept[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Streams one explanation into the coach store, keyed by ply.
 *
 * Nothing here touches the board or the game clock. If it fails, the annotation
 * keeps its engine facts and switches to the error state — an explanation is
 * never allowed to be the reason a move cannot be played.
 */
export async function requestExplanation(
  annotation: Annotation,
  settings: Settings,
  signal: AbortSignal,
) {
  const coach = useCoach.getState();
  const { ply } = annotation;

  try {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        annotation,
        verbosity: settings.verbosity,
        level: settings.level,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      coach.upsert(ply, { ply, stage: "error" });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Newline-delimited: keep the trailing partial line for the next chunk.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        if (!raw.trim()) continue;
        let event: Event;
        try {
          event = JSON.parse(raw) as Event;
        } catch {
          continue;
        }

        if (event.type === "concepts") {
          coach.upsert(ply, { ply, concepts: event.concepts });
        } else if (event.type === "delta") {
          if (!started) {
            started = true;
            coach.upsert(ply, { ply, stage: "streaming", prose: "" });
            // One chime per note, at the moment there is something to read.
            playCue("note");
          }
          useCoach.getState().appendProse(ply, event.text);
        } else if (event.type === "done") {
          coach.upsert(ply, { ply, stage: "complete" });
        } else if (event.type === "error") {
          coach.upsert(ply, { ply, stage: "error" });
        }
      }
    }

    const finalStage = useCoach.getState().byPly[ply]?.stage;
    if (finalStage === "streaming" || finalStage === "retrieving") {
      coach.upsert(ply, { ply, stage: "complete" });
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    coach.upsert(ply, { ply, stage: "error" });
  }
}

/**
 * Streams the "why is this the move" answer for a hint into the hint store.
 *
 * Same endpoint and same transport as an annotation; only the prompt differs. If
 * it fails the player still has the arrow — the explanation is the bonus, not the
 * feature.
 */
export async function requestHintReason(
  input: { ply: number; fen: string; bestSan: string; side: Side },
  settings: Settings,
  signal: AbortSignal,
  onlineGameId?: string,
) {
  const hint = useHint.getState();
  hint.begin(input.ply);

  try {
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "hint",
        fen: input.fen,
        bestSan: input.bestSan,
        side: input.side,
        level: settings.level,
        onlineGameId,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      useHint.getState().patch({ stage: "error" });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        if (!raw.trim()) continue;
        let event: Event;
        try {
          event = JSON.parse(raw) as Event;
        } catch {
          continue;
        }
        // A move played mid-stream retires this hint; drop what is still arriving.
        if (useHint.getState().ply !== input.ply) return;

        if (event.type === "concepts") useHint.getState().patch({ concepts: event.concepts });
        else if (event.type === "delta") useHint.getState().append(input.ply, event.text);
        else if (event.type === "done") useHint.getState().patch({ stage: "complete" });
        else if (event.type === "error") useHint.getState().patch({ stage: "error" });
      }
    }

    if (useHint.getState().ply === input.ply && useHint.getState().stage === "streaming") {
      useHint.getState().patch({ stage: "complete" });
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    if (useHint.getState().ply === input.ply) useHint.getState().patch({ stage: "error" });
  }
}
