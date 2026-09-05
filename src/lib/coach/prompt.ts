import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { Annotation, Concept } from "@/lib/chess/types";
import { formatEval } from "@/lib/chess/eval";
import { QUALITY_LABEL } from "@/lib/chess/types";
import type { Level } from "@/lib/store/settings-store";

export type Verbosity = "terse" | "standard" | "deep";
export type { Level };

const LENGTH: Record<Verbosity, string> = {
  terse: "One sentence. Name the problem and the fix, nothing else.",
  standard: "Two to four sentences.",
  deep: "Two short paragraphs. You may quote the variation move by move.",
};

/* Vocabulary, not length — `LENGTH` below handles length. A coach that refuses to
   name anything leaves the player unable to read any other chess writing, so the
   rule is "define it", never "avoid it". */
const VOCABULARY: Record<Level, string> = {
  new: `The player is new to chess. Use no term they would have to look up. If a
term is genuinely unavoidable, define it in the same sentence in six words or
fewer. Say "the square in front of your king", not "the f2 weakness". Never write
"tempo", "prophylaxis", "zugzwang", "initiative" or "compensation" without saying
what they mean in ordinary words.`,
  improving: `The player knows the rules and common tactics. Standard terms like
pin, fork, skewer and open file are fine unglossed. Define anything more advanced
in a short clause.`,
  club: `The player is a club player. Use normal chess vocabulary freely and do not
explain basic terms.`,
};

/* Term marking. The model knows which of its own words are jargon far better than
   any keyword list we could maintain, so it tags them and the client turns matches
   into links to the concept pages. A response that ignores the rule degrades to
   plain prose — the client strips unmatched brackets. */
const TERM_RULE = `- When you use a chess term worth learning, wrap it in double
  square brackets: "your knight is [[hanging]]", "this wins by [[overloading]] the
  defender". Mark each term once, on first use. Wrap the term itself, never a whole
  clause, and never wrap a move like e4 or a number.`;

const SHARED_RULES = `- Never contradict, recalculate or second-guess the engine's numbers or its
  preferred move. Treat them as ground truth.
- Never invent a variation. If you quote moves, quote only the variation given.
- Address the player as "you". Do not open with a greeting or a restatement of
  the move; start with the substance.
- Write numbers as digits: "-0.26", "31%", "5.g4". Never spell an evaluation out
  in words.
${TERM_RULE}
- Plain prose. No headings, no lists, no markdown, no emoji.`;

/* The engine has already decided everything factual: which move was better, how
   much the evaluation moved, and how severe that is. The model's only job is to
   explain why — so the instructions below forbid it from re-deciding any of it. */
export function systemPrompt(level: Level): string {
  return `You are a chess coach explaining one move to the player who just made it.

The engine has already done the analysis. You are given the move played, the move
the engine preferred, both evaluations, the severity, and the engine's variation.

${VOCABULARY[level]}

Rules:
${SHARED_RULES}
- Cite the evaluation swing in pawns at least once, using the numbers provided.
- Explain the *reason* the better move is better, in terms of the position:
  which squares, which pieces, what the opponent was threatening.`;
}

/* A hint is the opposite situation: the move has not been played, so there is no
   mistake to diagnose and nothing to be smug about. Reciting the whole variation
   would also hand over the next four moves, which is exactly the thinking the
   player should be doing. */
export function hintSystemPrompt(level: Level): string {
  return `You are a chess coach. The player has asked why the engine likes one
particular move in the position in front of them. They have NOT played it yet.

${VOCABULARY[level]}

Rules:
${SHARED_RULES}
- Say what the move accomplishes: what it attacks, defends, opens or stops.
- Do NOT walk through the variation, and do not reveal what happens several moves
  later. One idea, so they can work out the rest themselves.
- Do not tell them to play it. Describe the idea and stop.
- Never mention an evaluation number for a move that has not been played.
- At most two sentences, whatever the level.`;
}

export function buildUserPrompt(
  annotation: Annotation,
  concepts: Concept[],
  verbosity: Verbosity,
): string {
  const drop = Math.abs(annotation.winPctBefore - annotation.winPctAfter).toFixed(1);
  const praise = annotation.quality === "best" || annotation.quality === "brilliant";

  return [
    `Position before the move (FEN): ${annotation.fenBefore}`,
    `Side to move: ${annotation.side}`,
    `Move played: ${annotation.moveNumber}${annotation.side === "white" ? "." : "..."} ${annotation.playedSan}`,
    `Engine's preferred move: ${annotation.bestSan}`,
    `Evaluation before: ${formatEval(annotation.evalBefore)}`,
    `Evaluation after: ${formatEval(annotation.evalAfter)}`,
    `Winning chances lost: ${drop}%`,
    `Severity: ${QUALITY_LABEL[annotation.quality]}`,
    annotation.pvSan.length
      ? `Engine variation from the position before the move: ${annotation.pvSan.join(" ")}`
      : "",
    concepts.length
      ? `Principles retrieved for this position (weave in the ones that genuinely apply, ignore the rest):\n${concepts
          .map((c) => `- ${c.name}: ${c.blurb}`)
          .join("\n")}`
      : "",
    "",
    praise
      ? "This move matched the engine's choice. Confirm briefly why it is right; do not manufacture a criticism."
      : "Explain why the engine's move was better.",
    LENGTH[verbosity],
  ]
    .filter(Boolean)
    .join("\n");
}

/** The "?" beside the hint. Deliberately given less than an annotation gets: the
 *  position, the move, and the principles — no evaluations, because quoting a
 *  number for an unplayed move invites the model to promise an outcome. */
export function buildHintPrompt(
  input: { fen: string; bestSan: string; side: "white" | "black" },
  concepts: Concept[],
): string {
  return [
    `Position (FEN): ${input.fen}`,
    `Side to move: ${input.side}`,
    `The move the engine prefers here: ${input.bestSan}`,
    concepts.length
      ? `Principles retrieved for this position (use the ones that genuinely apply):\n${concepts
          .map((c) => `- ${c.name}: ${c.blurb}`)
          .join("\n")}`
      : "",
    "",
    `Explain in at most two sentences what ${input.bestSan} achieves.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* Flash-Lite is the workhorse. It is free on every Gemini service tier, and the
   job here is narrow — the engine has already decided every fact, so the model
   only has to write two or three sentences of prose around numbers it is handed.
   Flash costs ~5× more and is reserved for "deep", where the extra room actually
   buys a better-argued paragraph.

   IDs are bare, with no `provider/` prefix: this talks to the Gemini API
   directly rather than routing through a gateway. */
const MODEL: Record<Verbosity, string> = {
  terse: "gemini-3.5-flash-lite",
  standard: "gemini-3.5-flash-lite",
  deep: "gemini-3.5-flash",
};

export function modelFor(verbosity: Verbosity): LanguageModel {
  return google(process.env.COACH_MODEL || MODEL[verbosity]);
}
