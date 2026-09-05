"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Dumbbell, FlipVertical2, Play, RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChessBoard } from "@/components/board/chess-board";
import { BoardControls } from "@/components/board/board-controls";
import type { BoardArrow } from "@/components/board/board-arrows";
import { EvalGraph, type GraphMarker } from "@/components/eval/eval-graph";
import { EvalBar } from "@/components/eval/eval-bar";
import { CoachPanel } from "@/components/coach/coach-panel";
import { ConceptDrawer } from "@/components/coach/concept-drawer";
import { MoveList } from "@/components/game/move-list";
import { AccuracyDial } from "./accuracy-dial";
import { ConceptReport } from "./concept-report";
import { KeyMoments } from "./key-moments";
import { fenAtPly, lastMoveAtPly, useGame } from "@/lib/store/game-store";
import { evalAtPly, useEngine } from "@/lib/store/engine-store";
import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";
import { useSettings } from "@/lib/store/settings-store";
import { toMoveRows } from "@/lib/game/rows";
import { gameStats } from "@/lib/game/stats";
import { opponentFor } from "@/lib/engine/opponents";
import { plainProse } from "@/components/coach/coach-prose";
import { splitUci, toPgn } from "@/lib/game/notation";
import { QualityTally } from "@/components/coach/quality-tally";
import type { Concept } from "@/lib/chess/types";

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ReviewView() {
  const game = useGame();
  const analysis = useEngine((state) => state.analysis);
  const byPly = useCoach((state) => state.byPly);
  const settings = useSettings();
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [concept, setConcept] = useState<Concept | null>(null);

  const annotations = useMemo(() => sortedAnnotations(byPly), [byPly]);
  const rows = useMemo(
    () => toMoveRows(game.plies, byPly, game.hintedPlies),
    [game.plies, byPly, game.hintedPlies],
  );
  const total = game.plies.length;

  const ply = viewPly ?? annotations.at(-1)?.ply ?? total;
  const active = byPly[ply];

  const evals = useMemo(
    () => Array.from({ length: total + 1 }, (_, i) => evalAtPly(analysis, i)),
    [analysis, total],
  );

  const markers = useMemo<GraphMarker[]>(
    () => annotations.map((a) => ({ ply: a.ply, quality: a.quality })),
    [annotations],
  );

  /* Accuracy, the quality tally and the hint count all come from `gameStats`, the
     same function the game-over dialog calls the instant the game ends. Two copies
     of this arithmetic would eventually differ by a point, and a number that
     changes when you click through to the full review looks invented. */
  const stats = useMemo(
    () =>
      gameStats({
        plies: game.plies,
        analysis,
        annotations,
        hintedPlies: game.hintedPlies,
        playerSide: game.playerColor === "w" ? "white" : "black",
      }),
    [game.plies, analysis, annotations, game.hintedPlies, game.playerColor],
  );
  const { accuracy, qualities, hintedCount } = stats;

  const arrows = useMemo<BoardArrow[]>(() => {
    if (!active) return [];
    const record = game.plies[active.ply - 1];
    const best = analysis[active.ply - 1]?.bestMove;
    if (!record) return [];
    const played: BoardArrow = { from: record.from, to: record.to, kind: "played" };
    if (!best) return [played];
    const { from, to } = splitUci(best);
    if (from === record.from && to === record.to) return [played];
    return [played, { from, to, kind: "best" }];
  }, [active, analysis, game.plies]);

  const step = (key: "first" | "prev" | "next" | "last") =>
    setViewPly(
      key === "first" ? 0 : key === "last" ? total : key === "prev" ? Math.max(0, ply - 1) : Math.min(total, ply + 1),
    );

  const downloadPgn = () => {
    const comments: Record<number, string> = {};
    for (const annotation of annotations) {
      // PGN comments are plain text; the [[term]] markup is a UI convention.
      if (annotation.prose) comments[annotation.ply] = plainProse(annotation.prose);
    }
    const pgn = toPgn(game.plies, {
      Event: "AI Chess Coach",
      White: game.playerColor === "w" ? "You" : `Stockfish ${settings.elo}`,
      Black: game.playerColor === "w" ? `Stockfish ${settings.elo}` : "You",
      Result: game.result?.playerWon === null ? "1/2-1/2" : game.result?.playerWon ? "1-0" : "0-1",
      Date: new Date().toISOString().slice(0, 10),
    }, comments);
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "game.pgn";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (total === 0) {
    return (
      <div className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <Trophy className="mx-auto size-8 text-muted-foreground/40" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">No game to review yet</h1>
          <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
            Play a game and this page fills in: accuracy, the evaluation curve,
            your biggest swings, and the themes the coach kept citing.
          </p>
          <Button asChild className="mt-5">
            <Link href="/play">
              <Play className="size-4" aria-hidden /> Play a game
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const boardFen = active ? active.fenBefore : fenAtPly(game.plies, ply);
  const boardLast = active ? null : lastMoveAtPly(game.plies, ply);

  return (
    <div
      className="mx-auto w-full max-w-[100rem] flex-1 px-3 py-4 sm:px-5"
      data-board={settings.boardTheme}
    >
      <header className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/12 text-primary">
            <Trophy className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">
              {game.result?.outcome ?? "Game in progress"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {game.result?.detail ?? `${Math.ceil(total / 2)} moves so far`} · vs Stockfish 18 at{" "}
              {opponentFor(settings.elo).name} ({settings.elo})
            </p>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={downloadPgn}>
              <Download className="size-3.5" aria-hidden /> PGN
            </Button>
            <Button size="sm" className="h-8 text-xs" asChild>
              <Link href="/play">
                <RotateCcw className="size-3.5" aria-hidden /> Rematch
              </Link>
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AccuracyDial
            value={accuracy.white ?? 0}
            label={`White · ${accuracy.white?.toFixed(1) ?? "—"}%`}
            sublabel={game.playerColor === "w" ? "You" : "Stockfish"}
          />
          <AccuracyDial
            value={accuracy.black ?? 0}
            label={`Black · ${accuracy.black?.toFixed(1) ?? "—"}%`}
            sublabel={game.playerColor === "b" ? "You" : "Stockfish"}
          />
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="eyebrow">Your moves</p>
              <span className="tnum font-mono text-2xs text-muted-foreground">
                {qualities.length} reviewed
                {hintedCount > 0 && ` · ${hintedCount} hinted`}
              </span>
            </div>
            <QualityTally qualities={qualities} />
            <p className="mt-2.5 font-serif text-xs leading-snug text-muted-foreground">
              Accuracy uses Lichess&apos; win%-based curve, averaged per move, so a
              single dropped pawn from equality reads as an inaccuracy rather than
              a disaster.
            </p>
          </div>
        </div>
      </header>

      <Panel
        title="Evaluation"
        className="mt-4 rounded-xl border bg-card p-4"
        action={
          <span className="tnum font-mono text-2xs text-muted-foreground">
            move {Math.ceil(ply / 2) || 1} of {Math.ceil(total / 2)}
          </span>
        }
      >
        <EvalGraph
          evals={evals}
          markers={markers}
          activePly={ply}
          onSelect={setViewPly}
          className="h-24 w-full overflow-hidden rounded-lg border"
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        <aside className="hidden min-h-0 xl:block">
          <div className="flex h-[34rem] flex-col rounded-xl border bg-sidebar">
            <h2 className="border-b px-3 py-2 text-sm font-semibold">Notation</h2>
            <div className="min-h-0 flex-1">
              <MoveList rows={rows} activePly={ply} onSelect={setViewPly} />
            </div>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-stretch gap-2.5">
            <EvalBar
              evaluation={evalAtPly(analysis, ply) ?? { kind: "cp", cp: 0 }}
              orientation="vertical"
              flipped={flipped}
              className="hidden shrink-0 sm:flex"
            />
            <div className="mx-auto w-full min-w-0 max-w-[34rem]">
              <ChessBoard fen={boardFen} flipped={flipped} lastMove={boardLast} arrows={arrows} />
            </div>
          </div>
          <EvalBar
            evaluation={evalAtPly(analysis, ply) ?? { kind: "cp", cp: 0 }}
            orientation="horizontal"
            flipped={flipped}
            className="sm:hidden"
          />
          <div className="flex items-center gap-1">
            <BoardControls onStep={step} atStart={ply === 0} atEnd={ply === total} />
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setFlipped((f) => !f)}
            >
              <FlipVertical2 className="size-4" aria-hidden />
              <span className="sr-only">Flip board</span>
            </Button>
          </div>
        </main>

        <CoachPanel
          annotations={annotations}
          activePly={ply}
          onSelect={setViewPly}
          onConcept={setConcept}
          onShow={(a) => setViewPly(a.ply)}
          className="max-h-[34rem] lg:max-h-none"
        />
      </div>

      {annotations.length > 0 && (
        <Panel title="Key moments" className="mt-6">
          <KeyMoments
            annotations={annotations}
            plies={game.plies}
            bestMoveAt={(p) => analysis[p - 1]?.bestMove ?? null}
            onSelect={setViewPly}
          />
        </Panel>
      )}

      <Panel
        title="What to practise"
        className="mt-6 rounded-xl border bg-card p-4"
        action={
          annotations.length > 0 ? (
            <Button size="sm" className="h-8 text-xs" asChild>
              <Link href="/practise">
                <Dumbbell className="size-3.5" aria-hidden /> Practise these
              </Link>
            </Button>
          ) : undefined
        }
      >
        <p className="mb-3 font-serif text-sm leading-relaxed text-muted-foreground">
          Themes the coach cited while explaining your mistakes, most frequent first.
          Reading them is worth less than replaying the positions they came from.
        </p>
        <ConceptReport annotations={annotations} onConcept={setConcept} />
      </Panel>

      <ConceptDrawer concept={concept} onOpenChange={(v) => !v && setConcept(null)} />
    </div>
  );
}
