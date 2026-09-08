"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chess } from "chess.js";
import {
  ArrowRight,
  Check,
  Dumbbell,
  Eye,
  Lightbulb,
  Loader2,
  Play,
  RotateCcw,
  SkipForward,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChessBoard } from "@/components/board/chess-board";
import { QualityBadge } from "@/components/coach/quality-badge";
import { CoachProse } from "@/components/coach/coach-prose";
import { ConceptChip } from "@/components/coach/concept-chip";
import { ConceptDrawer } from "@/components/coach/concept-drawer";
import {
  drillsFrom,
  drillsFromMany,
  judgeAttempt,
  type Drill,
  type Verdict,
} from "@/lib/game/drill";
import { archive, isRestorable } from "@/lib/archive";
import { CONCEPT_BY_SLUG, publicConcept } from "@/lib/coach/concepts";
import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";
import { useSettings } from "@/lib/store/settings-store";
import { playCue } from "@/lib/audio/sfx";
import type { BoardArrow } from "@/components/board/board-arrows";
import type { Annotation, Concept, Square } from "@/lib/chess/types";

/** How a position ended up. Shown, not hidden: a set where four were revealed is a
 *  different session from one where four were solved, and the summary should say so. */
type Outcome = "solved" | "shown" | "skipped";

/* The only screen in the app that asks the player to do something rather than read
   something. Positions come from their own game, the answer is the engine's move
   they already had explained to them, and a wrong attempt loops back to the same
   board — reattempting is where a mistake turns into a lesson.

   Being stuck has an exit. Lichess puts a "view the solution" control on every
   puzzle for the same reason: a player who cannot find the move and cannot move on
   closes the tab, and a revealed answer they read is worth more than a position they
   abandoned. Using it is recorded rather than punished. */
export function DrillView() {
  const byPly = useCoach((state) => state.byPly);
  const settings = useSettings();

  const annotations = useMemo(() => sortedAnnotations(byPly), [byPly]);

  /* Every analysed game's mistakes, not just the loaded one's — which is the point of
     keeping them. Loaded lazily and only when asked for: reading fifty stored reviews is
     a megabyte of JSON, and the common case is drilling the game you just played. */
  const [scope, setScope] = useState<"game" | "all">("game");
  const [archived, setArchived] = useState<{ gameId: string; annotations: Annotation[] }[] | null>(
    null,
  );
  useEffect(() => {
    if (scope !== "all" || archived !== null) return;
    let live = true;
    void (async () => {
      const store = await archive();
      const summaries = await store.summaries(40);
      const loaded = await Promise.all(
        summaries.map(async (summary) => ({
          gameId: summary.id,
          review: await store.review(summary.id),
        })),
      );
      if (!live) return;
      setArchived(
        loaded.flatMap(({ gameId, review }) =>
          isRestorable(review) ? [{ gameId, annotations: review.annotations }] : [],
        ),
      );
    })();
    return () => {
      live = false;
    };
  }, [scope, archived]);

  const drills = useMemo(() => {
    if (scope === "game") return drillsFrom(annotations);
    /* The loaded game goes in too, and first, so its positions win the dedupe: it may
       not be archived yet — the notes are still arriving — and a mistake you just made
       should not be missing from a list of your mistakes. */
    return drillsFromMany([
      { gameId: "", annotations },
      ...(archived ?? []).filter((source) => source.annotations.length > 0),
    ]);
  }, [scope, annotations, archived]);

  const loadingAll = scope === "all" && archived === null;

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [judging, setJudging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  /* Keyed by `drill.key` rather than by ply. Every game has a fourteenth move, so a
     ply number stopped being unique the moment a session could span games. */
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [concept, setConcept] = useState<Concept | null>(null);

  const drill = drills[index];
  const board = useMemo(() => (drill ? new Chess(drill.fen) : null), [drill]);
  const legal = useMemo(() => {
    if (!board) return {} as Record<string, Square[]>;
    const map: Record<string, Square[]> = {};
    for (const move of board.moves({ verbose: true })) {
      (map[move.from] ??= []).push(move.to);
    }
    return map;
  }, [board]);

  const passed = verdict?.kind === "best" || verdict?.kind === "good";
  const settled = passed || revealed;
  const note = drill ? byPly[drill.ply] : undefined;

  /* Only once you have solved it, or given up and asked. Drawing the answer while
     the position is still live would defeat the entire exercise. */
  const arrows = useMemo<BoardArrow[]>(() => {
    if (!drill || !settled) return [];
    const clone = new Chess(drill.fen);
    const move = clone.moves({ verbose: true }).find((m) => m.san === drill.bestSan);
    return move ? [{ from: move.from, to: move.to, kind: "best" }] : [];
  }, [drill, settled]);

  /* Read from the local corpus rather than off the annotation. The teaching fields
     are newer than some stored games, and the corpus is always current. */
  const concepts = useMemo(() => {
    const slugs = note?.concepts.map((c) => c.slug) ?? [];
    return slugs
      .map((slug) => CONCEPT_BY_SLUG.get(slug))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .map(publicConcept);
  }, [note]);

  const record = (key: string, outcome: Outcome) =>
    setOutcomes((prior) => (prior[key] ? prior : { ...prior, [key]: outcome }));

  const attempt = async (from: Square, to: Square) => {
    if (!drill) return;
    setJudging(true);
    const result = await judgeAttempt(drill, from, to);
    setJudging(false);
    setSelected(null);
    if (result.kind === "illegal") return;
    setVerdict(result);
    if (result.kind === "best" || result.kind === "good") {
      playCue("win");
      record(drill.key, "solved");
    } else {
      playCue("illegal");
    }
  };

  const onSquareClick = (square: Square) => {
    if (!drill || judging || settled) return;
    if (selected && legal[selected]?.includes(square)) {
      void attempt(selected, square);
      return;
    }
    setSelected(legal[square] ? square : null);
  };

  const clear = () => {
    setVerdict(null);
    setSelected(null);
    setRevealed(false);
  };

  const advance = () => {
    clear();
    setIndex((i) => i + 1);
  };

  const reveal = () => {
    if (!drill) return;
    playCue("note");
    setSelected(null);
    setRevealed(true);
    record(drill.key, "shown");
  };

  const skip = () => {
    if (!drill) return;
    record(drill.key, "skipped");
    advance();
  };

  const counts = useMemo(() => {
    const values = Object.values(outcomes);
    return {
      solved: values.filter((v) => v === "solved").length,
      shown: values.filter((v) => v === "shown").length,
      skipped: values.filter((v) => v === "skipped").length,
    };
  }, [outcomes]);

  const scopeSwitch = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={scope}
      onValueChange={(value) => {
        if (!value) return;
        setScope(value as "game" | "all");
        /* A different list is a different session: keeping the index would land you
           somewhere arbitrary, and keeping the outcomes would credit you for positions
           the new list may not contain. */
        setIndex(0);
        setOutcomes({});
        clear();
      }}
      className="[&>button]:h-7 [&>button]:px-2 [&>button]:text-xs"
    >
      <ToggleGroupItem value="game">This game</ToggleGroupItem>
      <ToggleGroupItem value="all">Every game</ToggleGroupItem>
    </ToggleGroup>
  );

  if (loadingAll) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-16">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Gathering your mistakes…
        </p>
      </div>
    );
  }

  if (drills.length === 0) {
    return (
      <div className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <Dumbbell className="mx-auto size-8 text-muted-foreground/40" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Nothing to practise yet</h1>
          <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
            {scope === "all"
              ? "No analysed game has a flagged move in it yet. Analyse one and its mistakes land here."
              : "Every move the coach flagged becomes a position here, dealt back to you with the answer hidden. Play a game first — the mistakes are the material."}
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            {scopeSwitch}
            <Button asChild>
              <Link href="/play">
                <Play className="size-4" aria-hidden /> Play a game
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!drill) {
    return (
      <div className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <Check className="mx-auto size-8 text-q-best-ink" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">
            {counts.solved} of {drills.length} found
          </h1>
          <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
            {counts.shown + counts.skipped > 0
              ? `${counts.shown} shown to you and ${counts.skipped} skipped. Those are the
                 ones to run again — a position you have read the answer to is not a
                 position you can find.`
              : `Every one of them found on your own. The positions stay here until you
                 play another game, so you can come back and run them cold.`}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIndex(0);
                clear();
                setOutcomes({});
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> Run them again
            </Button>
            <Button asChild>
              <Link href="/play">
                <Play className="size-4" aria-hidden /> New game
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-5"
      data-board={settings.boardTheme}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
          <Dumbbell className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold">Find a better move</h1>
          <p className="text-xs text-muted-foreground">
            Your move {drill.moveNumber}. You played{" "}
            <span className="tnum font-mono font-medium">{drill.playedSan}</span> and
            gave up{" "}
            <span className="tnum font-medium">{drill.lostPct.toFixed(0)}%</span>.
          </p>
        </div>
        <span className="ms-auto flex shrink-0 items-center gap-2">
          {scopeSwitch}
          <span className="tnum font-mono text-2xs text-muted-foreground">
            {index + 1} / {drills.length} · {counts.solved} found
          </span>
        </span>
      </header>

      <div className="mt-3 flex items-start gap-2.5">
        <div className="mx-auto w-full min-w-0 max-w-[34rem]">
          <ChessBoard
            fen={drill.fen}
            flipped={drill.ply % 2 === 0}
            arrows={arrows}
            selected={selected}
            legalMoves={legal}
            onSquareClick={onSquareClick}
            onMove={(from, to) => void attempt(from, to)}
            interactive={!settled && !judging}
            announcement={
              revealed
                ? `The move was ${drill.bestSan}.`
                : verdict
                  ? verdictText(verdict, drill.bestSan)
                  : "Find a better move."
            }
          />
        </div>
      </div>

      {revealed ? (
        <Answer
          bestSan={drill.bestSan}
          prose={note?.prose ?? ""}
          concepts={concepts}
          onConcept={setConcept}
          onNext={advance}
          last={index === drills.length - 1}
        />
      ) : (
        <Feedback
          verdict={verdict}
          judging={judging}
          drill={drill}
          prose={note?.prose ?? ""}
          onConcept={setConcept}
          onRetry={clear}
          onReveal={reveal}
          onSkip={skip}
          onNext={advance}
          last={index === drills.length - 1}
        />
      )}

      <ConceptDrawer concept={concept} onOpenChange={(v) => !v && setConcept(null)} />
    </div>
  );
}

function verdictText(verdict: Verdict, bestSan: string) {
  switch (verdict.kind) {
    case "best":
      return `${verdict.san} is the engine's move.`;
    case "good":
      return `${verdict.san} holds — the engine preferred ${bestSan}.`;
    case "worse":
      return `${verdict.san} gives up ${verdict.lostPct.toFixed(0)}%. Try again.`;
    default:
      return "";
  }
}

/* ── The answer ───────────────────────────────────────────────────────────────
   Three things, in the order they are useful: the move, why it works here, and
   when the same idea applies again. The third is the one that transfers — knowing
   that Nxe5 was right in one position teaches nothing on its own, and it is the
   half that a coach gives you and a solution screen usually does not.
   ─────────────────────────────────────────────────────────────────────────── */
function Answer({
  bestSan,
  prose,
  concepts,
  onConcept,
  onNext,
  last,
}: {
  bestSan: string;
  prose: string;
  concepts: Concept[];
  onConcept?: (c: Concept) => void;
  onNext: () => void;
  last: boolean;
}) {
  const lesson = concepts.find((c) => c.when);

  return (
    <div className="mt-3 rounded-xl border border-arrow-hint/40 bg-arrow-hint/[0.06] p-3.5">
      <p className="flex items-center gap-2 text-sm">
        <Lightbulb className="size-4 shrink-0 text-arrow-hint" aria-hidden />
        <span className="text-muted-foreground">The move was</span>
        <span className="tnum rounded bg-arrow-hint/12 px-1.5 py-0.5 font-mono text-sm font-semibold">
          {bestSan}
        </span>
      </p>

      {prose && (
        <div className="mt-2.5">
          <p className="eyebrow">Why</p>
          <p className="mt-1 font-serif text-base leading-relaxed text-card-foreground/90">
            <CoachProse prose={prose} onConcept={onConcept} />
          </p>
        </div>
      )}

      {lesson && (
        <div className="mt-3">
          <p className="eyebrow">When to use it</p>
          <p className="mt-1 font-serif text-base leading-relaxed text-card-foreground/90">
            {lesson.when}
          </p>
          {lesson.pitfall && (
            <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
              {lesson.pitfall}
            </p>
          )}
        </div>
      )}

      {concepts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {concepts.map((c) => (
            <ConceptChip key={c.slug} concept={c} onSelect={onConcept} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onNext}>
          {last ? "Finish" : "Next position"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function Feedback({
  verdict,
  judging,
  drill,
  prose,
  onConcept,
  onRetry,
  onReveal,
  onSkip,
  onNext,
  last,
}: {
  verdict: Verdict | null;
  judging: boolean;
  drill: Drill;
  prose: string;
  onConcept?: (c: Concept) => void;
  onRetry: () => void;
  onReveal: () => void;
  onSkip: () => void;
  onNext: () => void;
  last: boolean;
}) {
  if (judging) {
    return (
      <p className="mt-3 text-center text-sm text-muted-foreground">
        Checking your move against the engine…
      </p>
    );
  }

  /* Both exits are on screen from the first second, not offered as a consolation
     after a wrong guess. Someone who has no idea should not have to guess wrong
     first to earn the right to be told. */
  const exits = (
    <div className="flex gap-1.5">
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onReveal}>
        <Eye className="size-3.5" aria-hidden /> Show me
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onSkip}>
        <SkipForward className="size-3.5" aria-hidden /> Skip
      </Button>
    </div>
  );

  if (!verdict) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <QualityBadge quality={drill.quality} size="sm" showLabel />
          Play the move you wish you had found.
        </p>
        {exits}
      </div>
    );
  }

  const passed = verdict.kind === "best" || verdict.kind === "good";

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border p-3.5",
        passed
          ? "border-q-best/35 bg-q-best/[0.06]"
          : "border-q-mistake/35 bg-q-mistake/[0.06]",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        {passed ? (
          <Check className="size-4 shrink-0 text-q-best-ink" aria-hidden />
        ) : (
          <X className="size-4 shrink-0 text-q-mistake-ink" aria-hidden />
        )}
        {verdict.kind === "best" && "That is the move."}
        {verdict.kind === "good" &&
          `Good enough — that holds the position. The engine played ${drill.bestSan}.`}
        {verdict.kind === "worse" &&
          `That gives up ${verdict.lostPct.toFixed(0)}% too. Have another look.`}
      </p>

      {/* The note the coach already wrote for this move. Re-reading it *after* an
          attempt lands differently from reading it in a feed you scrolled past. */}
      {!passed && prose && (
        <p className="mt-2 font-serif text-base leading-relaxed text-card-foreground/90">
          <CoachProse prose={prose} onConcept={onConcept} />
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {passed ? (
          <Button size="sm" onClick={onNext}>
            {last ? "Finish" : "Next position"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={onRetry}>
              <RotateCcw className="size-3.5" aria-hidden /> Try again
            </Button>
            {exits}
          </>
        )}
      </div>
    </div>
  );
}
