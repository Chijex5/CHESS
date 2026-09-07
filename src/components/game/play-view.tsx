"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChessBoard } from "@/components/board/chess-board";
import { BoardControls, type Step } from "@/components/board/board-controls";
import { HintControls } from "@/components/board/hint-controls";
import { HintCard } from "@/components/coach/hint-card";
import { PromotionPicker } from "@/components/board/promotion-picker";
import type { BoardArrow } from "@/components/board/board-arrows";
import { EvalBar } from "@/components/eval/eval-bar";
import { ConceptDrawer } from "@/components/coach/concept-drawer";
import { PlayerStrip } from "./player-strip";
import { Clock } from "./clock";
import { MobileCoachDock } from "./mobile-coach-dock";
import { SideRail, type RailTab } from "./side-rail";
import { BoardMenu } from "./board-menu";
import { BoardMessageLine, RiskWarningDialog, type BoardMessage } from "./board-message";
import { GameOverDialog } from "./game-over-dialog";
import { SettingsPanel } from "@/components/setup/settings-panel";
import { opponentFor } from "@/lib/engine/opponents";
import { useGame, fenAtPly, lastMoveAtPly } from "@/lib/store/game-store";
import { describeEval } from "@/lib/chess/eval";
import { useEngine, evalAtPly } from "@/lib/store/engine-store";
import { sortedAnnotations, useCoach } from "@/lib/store/coach-store";
import { useHint } from "@/lib/store/hint-store";
import { useSettings } from "@/lib/store/settings-store";
import {
  bestMoveHere,
  confirmPendingRisk,
  dismissPendingRisk,
  explainHint,
  needsPromotion,
  playMove,
  flagFall,
  resign,
  resumeGame,
  retryMove,
  revealHint,
  startGame,
} from "@/lib/game/controller";
import { toMoveRows } from "@/lib/game/rows";
import { drillsFrom } from "@/lib/game/drill";
import { gameStats } from "@/lib/game/stats";
import { unlockAudio } from "@/lib/audio/sfx";
import { capturedFrom, parseFen, squareToIndex } from "@/lib/chess/fen";
import { splitUci } from "@/lib/game/notation";
import type { Concept, PieceType, Square } from "@/lib/chess/types";
import { useGameHistory } from "@/lib/store/game-history-store";

/* ── The playing surface ──────────────────────────────────────────────────────
   Rebuilt around one rule, taken from lichess's own layout brief: the board should
   occupy as much space as possible, and nothing essential may sit below the fold.

   What that cost, in order of how much noise each removed:
     · two side columns became one tabbed rail, freeing a whole column
     · four stacked alerts became one message line that is always the same height
     · two eval bars became one, beside the board rather than above it
     · ten controls became four arrows, a hint, and a menu
   The board is the only thing on this screen that got bigger.
   ─────────────────────────────────────────────────────────────────────────── */
export function PlayView() {
  const game = useGame();
  const engine = useEngine();
  const byPly = useCoach((state) => state.byPly);
  const hint = useHint();
  const settings = useSettings();
  const addHistory = useGameHistory((state) => state.add);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [rail, setRail] = useState<RailTab>("coach");
  const [celebrating, setCelebrating] = useState(false);

  /* The engines are module singletons and cost ~700ms to boot, so they are
     deliberately not torn down when this view unmounts — navigating to the
     review page and back should not reload 7 MB of WebAssembly. */
  useEffect(() => {
    // An AudioContext built before a gesture starts suspended; this binds the
    // one-shot listeners that resume it, so the first move already has sound.
    unlockAudio();
    /* A refresh keeps the moves (the store is persisted) but not the chess.js board
       this module owns, so the position has to be replayed before anything is
       clickable. Only a genuinely fresh visit starts a new game. */
    if (useGame.getState().status === "idle") void startGame();
    else void resumeGame();
  }, []);

  const annotations = useMemo(() => sortedAnnotations(byPly), [byPly]);
  const rows = useMemo(
    () => toMoveRows(game.plies, byPly, game.hintedPlies),
    [game.plies, byPly, game.hintedPlies],
  );
  const live = game.viewPly === game.plies.length;
  useEffect(() => {
    if (!game.result || game.plies.length === 0) return;
    addHistory({
      id: `engine:${game.plies.at(-1)?.fenAfter}:${game.result.detail}`,
      outcome: game.result.playerWon === null ? "Draw" : game.result.playerWon ? "Won" : "Lost",
      opponent: `Stockfish ${settings.elo}`,
      playedAt: new Date().toISOString(),
      moves: Math.ceil(game.plies.length / 2),
    });
  }, [addHistory, game.plies, game.result, settings.elo]);
  const fen = fenAtPly(game.plies, game.viewPly);
  const tray = useMemo(() => capturedFrom(parseFen(fen).cells), [fen]);

  const active = byPly[game.viewPly];
  const arrows = useMemo<BoardArrow[]>(() => {
    if (!active) return [];
    const record = game.plies[active.ply - 1];
    const best = engine.analysis[active.ply - 1]?.bestMove;
    if (!record) return [];
    const played: BoardArrow = { from: record.from, to: record.to, kind: "played" };
    if (!best) return [played];
    const { from, to } = splitUci(best);
    if (from === record.from && to === record.to) return [played];
    return [played, { from, to, kind: "best" }];
  }, [active, game.plies, engine.analysis]);

  const playerTurn =
    game.status === "playing" && game.plies.length % 2 === (game.playerColor === "w" ? 0 : 1);
  const interactive = live && playerTurn;

  /* The engine already searched this position after the opponent moved, so the hint
     is a store read plus one SAN conversion — cheap enough to do on every render,
     which is better than a memo whose real dependency is a mutable chess.js board.
     It only means anything while you are on the move at the live position. */
  const best = interactive ? bestMoveHere() : null;
  const hintFrom = game.hintStage >= 1 && best ? splitUci(best.uci).from : null;
  const hintUci = game.hintStage >= 2 && best ? best.uci : null;
  const boardArrows = useMemo<BoardArrow[]>(
    () => (hintUci ? [...arrows, { ...splitUci(hintUci), kind: "hint" }] : arrows),
    [arrows, hintUci],
  );

  const step = useCallback(
    (key: Step) =>
      useGame
        .getState()
        .setViewPly(
          key === "first"
            ? 0
            : key === "last"
              ? useGame.getState().plies.length
              : key === "prev"
                ? Math.max(0, useGame.getState().viewPly - 1)
                : Math.min(
                    useGame.getState().plies.length,
                    useGame.getState().viewPly + 1,
                  ),
        ),
    [],
  );

  /* Arrow keys, because stepping through a game with a mouse is nobody's habit.
     Bound to the window rather than the board so it works wherever focus sits,
     and skipped while a field or a dialog owns the keyboard. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;

      const key = event.key;
      const move: Partial<Record<string, Step>> = {
        ArrowLeft: "prev",
        ArrowRight: "next",
        Home: "first",
        End: "last",
      };
      if (move[key]) {
        event.preventDefault();
        step(move[key]!);
        return;
      }
      if (key === "f" || key === "F") {
        event.preventDefault();
        useGame.getState().flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  /* Opens once, on the transition into a finished game. A refresh restores the
     result from storage, and popping the celebration again for a game you already
     read the verdict on would be a party nobody asked for. */
  const priorResult = useRef(game.result?.outcome);
  useEffect(() => {
    const outcome = game.result?.outcome;
    if (outcome && !priorResult.current) setCelebrating(true);
    priorResult.current = outcome;
  }, [game.result?.outcome]);

  const onSquareClick = (square: Square) => {
    if (!interactive) return;
    if (game.selected && game.legal[game.selected]?.includes(square)) {
      if (needsPromotion(game.selected, square)) {
        game.patch({ pendingPromotion: { from: game.selected, to: square } });
        return;
      }
      void playMove(game.selected, square);
      return;
    }
    game.select(game.legal[square] ? square : null);
  };

  const evalHidden =
    settings.evalVisibility === "game-end"
      ? game.status !== "over"
      : settings.evalVisibility === "after-coach"
        ? !active
        : false;

  const displayEval =
    (live ? engine.liveEval : null) ??
    evalAtPly(engine.analysis, game.viewPly) ?? { kind: "cp" as const, cp: 0 };

  const promotionFile = game.pendingPromotion
    ? squareToIndex(game.pendingPromotion.to, game.flipped) % 8
    : 0;
  const promotionFromBottom = game.pendingPromotion
    ? squareToIndex(game.pendingPromotion.to, game.flipped) >= 32
    : false;

  const playerSide = game.playerColor === "w" ? "white" : "black";

  /* The warning itself is a focused dialog, rather than a status-row message that
     can be hidden beside the captured pieces. This line remains for non-blocking
     status only. */
  const message: BoardMessage = game.result
    ? { kind: "result", text: game.result.outcome, won: game.result.playerWon }
    : engine.error
      ? { kind: "engine-error", text: engine.error }
      : game.status === "thinking"
        ? { kind: "thinking" }
        : evalHidden
          ? null
          : { kind: "standing", text: describeEval(displayEval, playerSide) };

  const writing = annotations.some(
    (a) => a.stage === "streaming" || a.stage === "retrieving" || a.stage === "analyzing",
  );

  const stats = useMemo(
    () =>
      gameStats({
        plies: game.plies,
        analysis: engine.analysis,
        annotations,
        hintedPlies: game.hintedPlies,
        playerSide,
      }),
    [game.plies, engine.analysis, annotations, game.hintedPlies, playerSide],
  );
  const drillCount = useMemo(() => drillsFrom(annotations).length, [annotations]);
  const hintLive = hint.ply === game.plies.length && Boolean(best);

  const hintCard = hintLive ? (
    <HintCard
      move={best!.san}
      stage={hint.stage}
      prose={hint.prose}
      concepts={hint.concepts}
      onConcept={setConcept}
    />
  ) : null;

  return (
    <div
      /* From `lg` up the play area *is* the viewport minus the header (3.5rem —
         `h-14` on AppHeader), and every column scrolls inside itself. A game
         that runs past the screen used to grow this box, which scrolled the
         page and took the board with it. Below `lg` the page still scrolls. */
      className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col gap-3 px-3 py-3 sm:px-5 lg:h-[calc(100svh-3.5rem)] lg:flex-none"
      data-board={settings.boardTheme}
    >
      <RiskWarningDialog
        risk={game.pendingRisk}
        onLookAgain={dismissPendingRisk}
        onPlayAnyway={confirmPendingRisk}
      />
      {/* Two columns, not three. `minmax(0,1fr)` on the row is what stops a long
          notation list or a stack of coach cards from stretching the shell. */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)]">
        <main className="flex min-h-0 min-w-0 flex-col lg:[container-type:size]">
          {/* One stack, capped to roughly the width the board can actually reach, so
              the player rows and the controls line up with the board instead of
              running past it into empty column. `100cqh` is this column's height;
              the two `h-11` rows, the controls and three gaps take 9.25rem of it,
              and the eval bar gives ~2.75rem back on the horizontal — hence 6.5rem.
              Erring generous on purpose: the board has its own height cap below, so
              slack here costs a few pixels of alignment and never an overflow. */}
          <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:max-w-[calc(100cqh-6.5rem)]">
          <PlayerStrip
            name="Stockfish 18"
            sublabel={`${opponentFor(settings.elo).name} · ${settings.elo}`}
            color={game.playerColor === "w" ? "b" : "w"}
            captured={game.playerColor === "w" ? tray.blackTray : tray.whiteTray}
            advantage={Math.max(
              0,
              game.playerColor === "w" ? -tray.advantage : tray.advantage,
            )}
            thinking={game.status === "thinking"}
            active={!playerTurn && game.status !== "over"}
            trailing={<Clock side={playerSide === "white" ? "black" : "white"} onFlag={flagFall} />}
            className="shrink-0"
          />

          {/* The board is measured against the room this column has left rather
              than a guess at the viewport: `container-type: size` makes the
              arena's own height addressable as `100cqh`, so the board fills
              whatever is left after the strips and the controls have taken
              theirs — and nothing that appears later can push it under the fold. */}
          <div className="grid min-h-0 flex-1 place-items-center lg:min-h-[15rem] lg:[container-type:size]">
            <div className="flex w-full items-stretch gap-2">
              {/* One bar, beside the board rather than above it. Lichess keeps its
                  clocks on this side for the same reason: anything stacked over or
                  under the board is competing with it for vertical space, and the
                  board should win. */}
              <EvalBar
                evaluation={displayEval}
                orientation="vertical"
                settled={engine.settled}
                hidden={evalHidden}
                flipped={game.flipped}
                playerSide={playerSide}
                className="shrink-0"
              />
              {/* Below `lg` the page scrolls, so the cap there is still a guess at
                  the viewport: the header, two rows, the controls and the dock all
                  have to share a phone screen with the board. */}
              <div className="relative mx-auto w-full min-w-0 max-w-[min(100%,calc(100svh-21rem))] lg:max-w-[min(100%,100cqh)]">
                <ChessBoard
                  fen={fen}
                  flipped={game.flipped}
                  lastMove={lastMoveAtPly(game.plies, game.viewPly)}
                  arrows={boardArrows}
                  hintSquare={hintFrom}
                  checkSquare={live ? game.checkSquare : null}
                  selected={game.selected}
                  legalMoves={game.legal}
                  onMove={(from, to) => {
                    if (needsPromotion(from, to)) {
                      game.patch({ pendingPromotion: { from, to } });
                      return;
                    }
                    void playMove(from, to);
                  }}
                  announcement={game.lastAnnouncement}
                  onSquareClick={onSquareClick}
                  interactive={interactive}
                >
                  {game.pendingPromotion && (
                    <PromotionPicker
                      color={game.playerColor}
                      file={promotionFile}
                      fromBottom={promotionFromBottom}
                      onPick={(type: PieceType) => {
                        const move = game.pendingPromotion!;
                        game.patch({ pendingPromotion: null });
                        void playMove(move.from, move.to, type);
                      }}
                      onCancel={() => game.patch({ pendingPromotion: null })}
                    />
                  )}
                </ChessBoard>

                {engine.loading && (
                  <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/70 backdrop-blur-sm">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Loading Stockfish…
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <PlayerStrip
            name="You"
            sublabel={game.playerColor === "w" ? "White" : "Black"}
            color={game.playerColor}
            captured={game.playerColor === "w" ? tray.whiteTray : tray.blackTray}
            advantage={Math.max(
              0,
              game.playerColor === "w" ? tray.advantage : -tray.advantage,
            )}
            active={playerTurn}
            trailing={<Clock side={playerSide} onFlag={flagFall} />}
            className="shrink-0"
          />

          <div className="flex shrink-0 items-center justify-between gap-2">
            <BoardControls
              onStep={step}
              atStart={game.viewPly === 0}
              atEnd={live}
            />
            <BoardMessageLine message={message} className="min-w-0 flex-1 justify-end" />
            <div className="flex shrink-0 items-center gap-1">
              <HintControls
                stage={game.hintStage}
                available={Boolean(best)}
                /* Keyed to the hint itself, not to `engine.settled`: a commentary
                   search on a move already played used to spin this button while a
                   perfectly good hint was sitting there ready. */
                thinking={interactive && !best}
                explaining={hint.stage === "streaming"}
                onReveal={revealHint}
                onExplain={explainHint}
              />
              <BoardMenu
                onFlip={game.flip}
                onRetry={retryMove}
                canRetry={live && game.plies.length > 0 && game.status !== "over"}
                onNewGame={() => void startGame()}
                onSettings={() => setSettingsOpen(true)}
                onResign={resign}
                canResign={game.status !== "over"}
              />
            </div>
          </div>

          {/* Phones have no rail, so the hint explanation goes in the flow — the
              only surface where pushing content down is already the norm. */}
          {hintCard && <div className="shrink-0 lg:hidden">{hintCard}</div>}
          </div>

          <MobileCoachDock
            annotations={annotations}
            rows={rows}
            activePly={game.viewPly}
            moveCount={Math.ceil(game.plies.length / 2)}
            onSelect={game.setViewPly}
            onConcept={setConcept}
            onRetry={retryMove}
          />
        </main>

        <div className="hidden min-h-0 flex-col gap-2 lg:flex">
          {/* Pinned above the feed rather than filed in it: this is advice about a
              move you have not played, and the feed is the record of ones you have. */}
          {hintCard}
          <SideRail
            tab={rail}
            onTab={setRail}
            annotations={annotations}
            rows={rows}
            activePly={game.viewPly}
            moveCount={Math.ceil(game.plies.length / 2)}
            writing={writing}
            onSelect={game.setViewPly}
            onConcept={setConcept}
            onRetry={retryMove}
            className="min-h-0 flex-1"
          />
        </div>
      </div>

      {game.result && (
        <GameOverDialog
          result={game.result}
          stats={stats}
          playerSide={playerSide}
          drillCount={drillCount}
          open={celebrating}
          onOpenChange={setCelebrating}
          onNewGame={() => {
            setCelebrating(false);
            void startGame();
          }}
        />
      )}

      <ConceptDrawer concept={concept} onOpenChange={(v) => !v && setConcept(null)} />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="shrink-0 border-b">
            <SheetTitle>Game &amp; coaching</SheetTitle>
            <SheetDescription>
              Changes apply to the next move; engine strength applies to the next game.
            </SheetDescription>
          </SheetHeader>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <SettingsPanel value={settings} onChange={(next) => settings.set(next)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
