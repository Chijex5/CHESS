"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ClipboardList,
  Flag,
  Handshake,
  ListOrdered,
  Loader2,
  LogIn,
  Swords,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/board/chess-board";
import type { BoardArrow } from "@/components/board/board-arrows";
import { HintControls } from "@/components/board/hint-controls";
import { PromotionPicker } from "@/components/board/promotion-picker";
import { HintCard } from "@/components/coach/hint-card";
import { OpponentStrip } from "@/components/game/opponent-strip";
import { OnlineOverDialog } from "@/components/game/online-over-dialog";
import { RematchControls } from "@/components/game/rematch-controls";
import { InvitePanel } from "./invite-panel";
import { MoveList } from "@/components/game/move-list";
import { ChatPanel, ChatTabLabel, MobileChat } from "@/components/game/chat-panel";
import { useOnline } from "@/lib/store/online-store";
import { connect, joinGame, sendEngineMove, sendOffer } from "@/lib/multiplayer/client";
import { getAnalyst, getOpponent, setOpponentElo } from "@/lib/engine/manager";
import {
  boardFor,
  checkSquareOf,
  isMyTurn,
  lastMoveOf,
  legalFor,
  playOnline,
  turnOf,
} from "@/lib/multiplayer/controller";
import { opposite, type Seat } from "@/lib/multiplayer/protocol";
import { useRematchPhase } from "@/lib/multiplayer/use-rematch-phase";
import { capturedFrom, parseFen, squareToIndex } from "@/lib/chess/fen";
import { sansToRows } from "@/lib/game/rows";
import { useSettings } from "@/lib/store/settings-store";
import { useHint } from "@/lib/store/hint-store";
import { playCue } from "@/lib/audio/sfx";
import { requestHintReason } from "@/lib/coach/client";
import { splitUci, uciToSan } from "@/lib/game/notation";
import type { PieceType, Square } from "@/lib/chess/types";
import type { HintStage } from "@/lib/store/game-store";

/* ── The online board ─────────────────────────────────────────────────────────
   Everything the engine game shows that would be engine help is simply absent:
   there is no eval bar, no hint pair, no coach panel and no analysis running. Not
   disabled — absent, because a greyed-out hint button still tells you the app knows
   the answer and is withholding it.

   What replaces them is the other person: who they are, what they are rated, whose
   clock is running, and whether your own connection is still up.
   ─────────────────────────────────────────────────────────────────────────── */
export function OnlineView({ gameId }: { gameId: string }) {
  const boardTheme = useSettings((state) => state.boardTheme);
  const snapshot = useOnline((state) => state.snapshot);
  const pending = useOnline((state) => state.pending);
  const connection = useOnline((state) => state.connection);
  const rejection = useOnline((state) => state.rejection);
  const settings = useSettings();
  const hint = useHint();

  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [rail, setRail] = useState<"moves" | "chat">("moves");
  const [hintStage, setHintStage] = useState<{ position: string; stage: HintStage }>({
    position: "",
    stage: 0,
  });
  const [bestHint, setBestHint] = useState<{ position: string; uci: string; san: string } | null>(null);
  const [hintThinking, setHintThinking] = useState(false);
  /* Whether the seat-claiming POST has been sent, held in a ref rather than state:
     nothing renders differently for it, and as state it would make the effect below
     set state synchronously and cascade a render. */
  const claimed = useRef(false);

  /* One stream for the life of the page. `connect` opens the EventSource and returns
     its teardown; the browser handles reconnection, so there is no retry loop here. */
  useEffect(() => connect(gameId), [gameId]);

  /* A host watching an empty board has no reason to be looking at it, so the moment
     their opponent sits down is announced rather than merely rendered. */
  const justStarted = useOnline((state) => state.justStarted);
  useEffect(() => {
    if (justStarted) playCue("note");
  }, [justStarted]);

  /* Both players end up in the new game from here, but by different routes: the one
     who accepted was told the id in its own response, and the one who offered finds it
     on the next snapshot. This is that second path, and it is the reason `rematchId`
     had to join the stream's fingerprint.

     On the transition, not on the state — the same rule as the result dialog, and for a
     sharper reason. A finished game keeps its pointer forever, so redirecting whenever
     one is *present* would make the old game unreachable: pressing back, or opening it
     from your history to analyse it, would bounce you straight out again. So the jump
     only happens when the pointer appears while you are watching. Arriving at a game
     that already has a successor gets a link instead — see `StatusLine`. */
  const router = useRouter();
  const rematchId = snapshot?.rematchId ?? null;
  const hasSnapshot = snapshot !== null;
  const sawWithout = useRef(false);
  useEffect(() => {
    if (!hasSnapshot) return;
    if (!rematchId) {
      sawWithout.current = true;
      return;
    }
    if (sawWithout.current) router.push(`/g/${rematchId}`);
  }, [hasSnapshot, rematchId, router]);

  /* The other way a negotiation ends. A refusal moves *both* players to the summary:
     the one who said no goes from their own click (see `RematchControls`), and the one
     who asked goes from here, when the answer comes down the stream. Same transition
     rule as above — a game whose rematch was refused keeps saying so forever, and
     opening it later from your history should show the board, not bounce you. */
  const declined = snapshot?.rematchDeclinedBy ?? null;
  const seated = Boolean(snapshot?.seat);
  const sawUndeclined = useRef(false);
  useEffect(() => {
    if (!hasSnapshot) return;
    if (!declined) {
      sawUndeclined.current = true;
      return;
    }
    if (sawUndeclined.current && seated) router.replace(`/g/${gameId}/summary`);
  }, [hasSnapshot, declined, seated, gameId, router]);

  /* Opened on the transition, not on the state: coming back to a game you already
     saw the result of should not reopen the celebration. */
  const [showResult, setShowResult] = useState(false);
  const wasFinished = useRef<boolean | null>(null);
  const finished = snapshot?.status === "finished";
  useEffect(() => {
    if (wasFinished.current === false && finished) {
      setShowResult(true);
      playCue(
        snapshot?.winner === "draw"
          ? "draw"
          : snapshot?.winner === snapshot?.seat
            ? "win"
            : "loss",
      );
    }
    if (snapshot) wasFinished.current = finished;
  }, [finished, snapshot]);

  /* Taking a seat is a POST, so merely opening a link does not consume it — but if
     you are the second person to arrive, you want to be seated without a further
     click. Sent at most once per mount, and only while the game is still pending. */
  const status = snapshot?.status;
  const seat = snapshot?.seat ?? null;
  useEffect(() => {
    if (status !== "pending" || seat || claimed.current) return;
    claimed.current = true;
    void joinGame(gameId).then((result) => {
      if (!result) setNeedsAuth(true);
      else useOnline.getState().applySnapshot(result);
    });
  }, [status, seat, gameId]);

  const board = useMemo(() => boardFor(snapshot, pending), [snapshot, pending]);
  const legal = useMemo(
    () => (isMyTurn(snapshot, pending) ? legalFor(board, seat) : {}),
    [board, seat, snapshot, pending],
  );
  const fen = board.fen();
  const tray = useMemo(() => capturedFrom(parseFen(fen).cells), [fen]);

  /* Black sees the board from Black's side. A spectator gets White's view, which is
     the convention every client follows. */
  const flipped = seat === "black";
  const mySeat: Seat = seat ?? "white";
  const theirSeat = opposite(mySeat);
  const turn = snapshot ? turnOf(snapshot, pending) : "white";
  const myTurn = isMyTurn(snapshot, pending);
  const developerAssistance = Boolean(snapshot?.canUseDeveloperAssistance);

  /* The analyst is intentionally started only after the server has granted this
     account the capability. It is separate from the fallback opponent worker, so a
     hint search never weakens or delays that opponent's move. */
  useEffect(() => {
    useHint.getState().clear();
    if (!developerAssistance || !myTurn || status !== "active") return;

    let current = true;
    void (async () => {
      // Starting asynchronously avoids an effect-time render cascade while still
      // making the loading state visible before Stockfish has returned a move.
      await Promise.resolve();
      if (!current) return;
      setHintThinking(true);
      const result = await getAnalyst().search({ fen, movetimeMs: 500 });
      if (current && result.bestMove) {
        const san = uciToSan(fen, result.bestMove);
        if (san) setBestHint({ position: fen, uci: result.bestMove, san });
      }
      if (current) setHintThinking(false);
    })();
    return () => {
      current = false;
    };
  }, [developerAssistance, fen, myTurn, snapshot?.id, snapshot?.seq, status]);

  const liveBestHint = bestHint?.position === fen ? bestHint : null;
  const liveHintStage = hintStage.position === fen ? hintStage.stage : 0;
  const hintFrom = liveHintStage >= 1 && liveBestHint ? splitUci(liveBestHint.uci).from : null;
  const hintArrows = useMemo<BoardArrow[]>(
    () => (liveHintStage >= 2 && liveBestHint ? [{ ...splitUci(liveBestHint.uci), kind: "hint" }] : []),
    [liveBestHint, liveHintStage],
  );

  const revealHint = () => {
    if (!liveBestHint) return;
    setHintStage((current) => ({
      position: fen,
      stage: Math.min(2, current.position === fen ? current.stage + 1 : 1) as HintStage,
    }));
  };

  const explainHint = () => {
    if (!liveBestHint || !snapshot) return;
    setHintStage({ position: fen, stage: 2 });
    void requestHintReason(
      {
        ply: snapshot.seq,
        fen,
        bestSan: liveBestHint.san,
        side: board.turn() === "w" ? "white" : "black",
      },
      settings,
      new AbortController().signal,
      snapshot.id,
    );
  };

  /* A fallback keeps the online presentation, but its move is generated locally just
   * like a normal engine game. No evaluation or suggestion is surfaced here. */
  const engineThinking = useRef(false);
  useEffect(() => {
    if (!snapshot?.engineElo || snapshot.status !== "active" || myTurn || engineThinking.current) return;
    const engineElo = snapshot.engineElo;
    // The generated username never exposes the synthetic id, so use the player's
    // seat: whenever it is not ours, it is the fallback engine's turn.
    if (turn !== opposite(snapshot.seat ?? "white")) return;
    engineThinking.current = true;
    const timer = window.setTimeout(() => {
      void setOpponentElo(engineElo).then(() => getOpponent(engineElo).search({ fen, movetimeMs: 650 })).then((result) => {
        if (!result.bestMove) return;
        const [from, to, promotion] = [result.bestMove.slice(0, 2), result.bestMove.slice(2, 4), result.bestMove[4]];
        return sendEngineMove(snapshot.id, { from, to, promotion, seq: snapshot.seq + 1 });
      }).finally(() => { engineThinking.current = false; });
    }, 450);
    return () => { window.clearTimeout(timer); engineThinking.current = false; };
  }, [fen, myTurn, snapshot, turn]);

  /* From the board rather than the snapshot, so a move you have just played and not
     yet had confirmed is already in the list. */
  const rows = useMemo(() => sansToRows(board.history()), [board]);

  const onSquareClick = (square: Square) => {
    if (!myTurn) return;
    if (selected && legal[selected]?.includes(square)) {
      if (needsPromotion(board, selected, square)) {
        setPromotion({ from: selected, to: square });
        setSelected(null);
        return;
      }
      setSelected(null);
      void playOnline(selected, square);
      return;
    }
    setSelected(legal[square] ? square : null);
  };

  if (needsAuth) {
    return (
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <LogIn className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Sign in to take the seat</h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Your opponent needs something to call you, and the result needs somewhere
            to go. Playing the engine still needs no account.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/sign-in?redirect_url=/g/${gameId}`}>Sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="grid flex-1 place-items-center px-4 py-16">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {connection === "closed" ? "That game could not be found." : "Loading the game…"}
        </p>
      </main>
    );
  }

  const players = { white: snapshot.white, black: snapshot.black };
  const waitingFor = snapshot.status === "pending";

  return (
    <div
      className="mx-auto flex w-full max-w-[80rem] flex-1 flex-col gap-3 px-3 py-3 sm:px-5 lg:h-[calc(100svh-3.5rem)] lg:flex-none"
      data-board={boardTheme}
    >
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:grid-rows-[minmax(0,1fr)]">
        <main className="flex min-h-0 min-w-0 flex-col lg:[container-type:size]">
          <div className="mx-auto flex min-h-0 w-full flex-1 flex-col gap-2 lg:max-w-[calc(100cqh-8rem)]">
            <OpponentStrip
              player={players[theirSeat]}
              seat={theirSeat}
              captured={theirSeat === "white" ? tray.whiteTray : tray.blackTray}
              advantage={Math.max(
                0,
                theirSeat === "white" ? tray.advantage : -tray.advantage,
              )}
              active={snapshot.status === "active" && turn === theirSeat}
              waiting={waitingFor && !players[theirSeat]}
              className="shrink-0"
            />

            <div className="grid min-h-0 flex-1 place-items-center lg:min-h-[15rem] lg:[container-type:size]">
              <div className="relative mx-auto w-full min-w-0 max-w-[min(100%,calc(100svh-20.5rem))] lg:max-w-[min(100%,100cqh)]">
                <ChessBoard
                  fen={fen}
                  flipped={flipped}
                  lastMove={lastMoveOf(board)}
                  checkSquare={checkSquareOf(board)}
                  hintSquare={hintFrom}
                  arrows={hintArrows}
                  selected={selected}
                  legalMoves={legal}
                  interactive={myTurn}
                  onSquareClick={onSquareClick}
                  onMove={(from, to) => {
                    if (needsPromotion(board, from, to)) {
                      setPromotion({ from, to });
                      return;
                    }
                    void playOnline(from, to);
                  }}
                  announcement={announcement(snapshot, myTurn)}
                >
                  {promotion && (
                    <PromotionPicker
                      color={mySeat === "white" ? "w" : "b"}
                      file={squareToIndex(promotion.to, flipped) % 8}
                      fromBottom={squareToIndex(promotion.to, flipped) >= 32}
                      onPick={(type: PieceType) => {
                        const move = promotion;
                        setPromotion(null);
                        void playOnline(move.from, move.to, type);
                      }}
                      onCancel={() => setPromotion(null)}
                    />
                  )}
                </ChessBoard>

                {/* Only for the host, and only while the seat is empty. A player who
                    followed a link is seated within a round trip and never sees it. */}
                {waitingFor && seat && <InvitePanel gameId={gameId} />}
              </div>
            </div>

            <OpponentStrip
              player={players[mySeat]}
              seat={mySeat}
              you
              captured={mySeat === "white" ? tray.whiteTray : tray.blackTray}
              advantage={Math.max(0, mySeat === "white" ? tray.advantage : -tray.advantage)}
              active={snapshot.status === "active" && turn === mySeat}
              showConnection
              className="shrink-0"
            />

            <StatusLine gameId={gameId} rejection={rejection} />
            {developerAssistance && (
              <div className="flex shrink-0 items-center justify-between gap-2">
                <HintControls
                  stage={liveHintStage}
                  available={Boolean(liveBestHint)}
                  thinking={hintThinking}
                  explaining={hint.stage === "streaming"}
                  onReveal={revealHint}
                  onExplain={explainHint}
                />
                <span className="text-2xs text-muted-foreground">Developer assistance</span>
              </div>
            )}
            {developerAssistance && liveBestHint && hint.ply === snapshot.seq && (
              <HintCard
                move={liveBestHint.san}
                stage={hint.stage}
                prose={hint.prose}
                concepts={hint.concepts}
              />
            )}
          </div>
        </main>

        {/* One rail, two tabs — the same pattern the engine game's `SideRail` uses, for
            the same reason: the board gets the column back, and there is one place to
            look rather than two. The engine version tabs the coach against the notation;
            here there is no coach, and the other person is the thing worth switching to. */}
        <aside className="surface-raised hidden min-h-0 flex-col rounded-xl lg:flex">
          <div
            role="tablist"
            aria-label="Moves and chat"
            className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
          >
            <RailTab
              current={rail === "moves"}
              onClick={() => setRail("moves")}
              id="rail-moves"
            >
              <ListOrdered className="size-3.5" aria-hidden />
              Moves
              <span className="tnum ms-0.5 font-mono text-2xs text-muted-foreground">
                {Math.ceil(snapshot.seq / 2)}
              </span>
            </RailTab>
            <RailTab
              current={rail === "chat"}
              onClick={() => {
                setRail("chat");
                useOnline.getState().markChatRead();
              }}
              id="rail-chat"
            >
              <ChatTabLabel />
            </RailTab>
          </div>

          <div className="relative min-h-0 flex-1">
            {rail === "moves" ? (
              <div className="absolute inset-0">
                {rows.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No moves yet.
                  </p>
                ) : (
                  <MoveList rows={rows} activePly={snapshot.seq} />
                )}
              </div>
            ) : (
              <ChatPanel gameId={gameId} className="absolute inset-0" />
            )}
          </div>
        </aside>
      </div>

      {snapshot.status === "finished" && (
        <OnlineOverDialog
          snapshot={snapshot}
          open={showResult}
          onOpenChange={setShowResult}
        />
      )}
    </div>
  );
}

/** A rail tab. Lifted from `SideRail`'s pattern rather than imported, because that one
 *  is wired to the coach panel and an online game has no coach. */
function RailTab({
  current,
  onClick,
  id,
  children,
}: {
  current: boolean;
  onClick: () => void;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={current}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        current
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** What a screen reader is told when the position changes. */
function announcement(
  snapshot: NonNullable<ReturnType<typeof useOnline.getState>["snapshot"]>,
  myTurn: boolean,
): string {
  if (snapshot.status === "pending") return "Waiting for an opponent to join.";
  if (snapshot.status === "finished") {
    return snapshot.winner === "draw"
      ? "The game is a draw."
      : `${snapshot.winner === "white" ? "White" : "Black"} won by ${snapshot.ending}.`;
  }
  const last = snapshot.sans.at(-1);
  const prefix = last ? `${Math.ceil(snapshot.seq / 2)}. ${last}. ` : "";
  return `${prefix}${myTurn ? "Your move." : "Waiting for your opponent."}`;
}

function needsPromotion(board: ReturnType<typeof boardFor>, from: string, to: string) {
  const piece = board.get(from as never);
  if (!piece || piece.type !== "p") return false;
  return to.endsWith(piece.color === "w" ? "8" : "1");
}

/* One row under the board, like the engine game's: whose move it is, an offer to
   answer, the result, or the last refusal — never more than one at a time. */
function StatusLine({
  gameId,
  rejection,
}: {
  gameId: string;
  rejection: string | null;
}) {
  const snapshot = useOnline((state) => state.snapshot);
  const phase = useRematchPhase(snapshot);
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;

  const act = async (action: string) => {
    setBusy(true);
    await sendOffer(gameId, action);
    setBusy(false);
  };

  if (snapshot.status === "finished") {
    /* An offer being negotiated takes the whole line rather than sharing it with the
       result. It is the only thing here waiting on a decision, and the result is
       already spelled out in the dialog that opened over this. */
    if (phase === "offered" || phase === "received") {
      return (
        <div className="flex h-9 shrink-0 items-center px-0.5">
          <RematchControls snapshot={snapshot} phase={phase} className="w-full" />
        </div>
      );
    }
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 px-0.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium">
          {snapshot.winner === "draw"
            ? `Draw by ${snapshot.ending}`
            : `${snapshot.winner === "white" ? "White" : "Black"} won by ${snapshot.ending}`}
        </p>
        <RematchControls snapshot={snapshot} phase={phase} />
        {/* This game already has a successor and you have come back to it deliberately.
            A link rather than a redirect, so that coming back is possible at all. */}
        {phase === "agreed" && snapshot.rematchId && (
          <Button asChild size="sm" variant="secondary" className="h-7 shrink-0 text-xs">
            <Link href={`/g/${snapshot.rematchId}`}>
              <ArrowRight className="size-3.5" aria-hidden /> Rematch
            </Link>
          </Button>
        )}
        {/* Summary rather than analysis: the summary is instant and analysis is one
            press further along it. This row is already four controls wide on a phone. */}
        <Button asChild size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
          <Link href={`/g/${gameId}/summary`}>
            <ClipboardList className="size-3.5" aria-hidden /> Summary
          </Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
          <Link href="/play/friend">
            <Swords className="size-3.5" aria-hidden /> New game
          </Link>
        </Button>
      </div>
    );
  }

  const theirOffer =
    snapshot.offer && snapshot.seat && snapshot.offer.by !== snapshot.seat
      ? snapshot.offer
      : null;

  if (theirOffer) {
    /* Not the h-9 status line. The game has stopped and is waiting on you, and that
       deserves to look different from "it is your move" — a banner that flashes once
       as it lands, with the two answers colour-coded and thumb-sized. The previous
       version was a 12px sentence and two 28px ghost buttons, which is a web form
       asking politely, on the one screen where nobody is reading carefully. */
    return (
      <div className="flash-once flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/[0.07] px-3 py-2">
        <Handshake className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold" aria-live="assertive">
          Your opponent offers a draw.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            className="h-9 bg-q-good/15 px-4 text-sm font-semibold text-q-good-ink hover:bg-q-good/25"
            disabled={busy}
            onClick={() => void act("accept-draw")}
          >
            <Check className="size-4" aria-hidden /> Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 px-4 text-sm font-semibold text-q-blunder-ink hover:bg-q-blunder/15"
            disabled={busy}
            onClick={() => void act("decline-draw")}
          >
            <X className="size-4" aria-hidden /> Decline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 px-0.5" aria-live="polite">
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          rejection ? "font-medium text-q-inaccuracy-ink" : "text-muted-foreground",
        )}
      >
        {rejection ??
          (snapshot.status === "pending"
            ? "Send the link — the clock starts when they arrive."
            : snapshot.offer
              ? "Draw offered. Waiting for an answer."
              : "")}
      </p>
      {snapshot.seat && <MobileChat gameId={gameId} />}
      {snapshot.status === "active" && snapshot.seat && (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs"
            disabled={busy || Boolean(snapshot.offer)}
            onClick={() => void act("offer-draw")}
          >
            <Handshake className="size-3.5" aria-hidden /> Draw
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs"
            disabled={busy}
            onClick={() => void act("resign")}
          >
            <Flag className="size-3.5" aria-hidden /> Resign
          </Button>
        </>
      )}
    </div>
  );
}
