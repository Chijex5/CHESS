"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, LogIn, Sparkles, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/board/chess-board";
import { MoveList } from "@/components/game/move-list";
import { GameResultCard } from "@/components/game/game-result-card";
import { RematchControls } from "@/components/game/rematch-controls";
import { useOnline } from "@/lib/store/online-store";
import { connect } from "@/lib/multiplayer/client";
import { boardFor, checkSquareOf, lastMoveOf } from "@/lib/multiplayer/controller";
import { useRematchPhase } from "@/lib/multiplayer/use-rematch-phase";
import { TIME_CONTROLS } from "@/lib/game/time-controls";
import { sansToRows } from "@/lib/game/rows";
import { useSettings } from "@/lib/store/settings-store";
import type { GameSnapshot, PublicPlayer, Seat } from "@/lib/multiplayer/protocol";

/* ── After the game ───────────────────────────────────────────────────────────
   Where a finished game goes. Until this existed there were two places to be once
   the result was in: the board, which is over, and the analysis, which takes the
   engine most of a minute and is not what most people want ten seconds after losing.
   This is the third: what happened, the final position, the moves, and the ways on —
   and it costs a fetch.

   It keeps the game's stream open, for the same reason the board does after the
   result: a rematch is offerable for two minutes, and an offer that arrived while
   you were looking at this page has to be able to reach you here. So the offer
   controls and the "they agreed, go" redirect are the board's, reused.
   ─────────────────────────────────────────────────────────────────────────── */
export function SummaryView({ gameId }: { gameId: string }) {
  const boardTheme = useSettings((state) => state.boardTheme);
  const snapshot = useOnline((state) => state.snapshot);
  const connection = useOnline((state) => state.connection);
  const phase = useRematchPhase(snapshot);
  const router = useRouter();

  useEffect(() => connect(gameId), [gameId]);

  /* The offerer's route to an agreed rematch, lifted from the board view along with
     its rule: on the transition, not on the state, so that a game whose rematch was
     agreed an hour ago can still be opened to look at. */
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

  const board = useMemo(() => boardFor(snapshot, null), [snapshot]);
  const rows = useMemo(() => sansToRows(snapshot?.sans ?? []), [snapshot]);

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

  /* A game still going has no summary yet, and a spectator has no chair to summarise
     from. Both get sent to the board, which knows what to do with them. */
  if (snapshot.status !== "finished") {
    return (
      <Empty
        icon={Swords}
        title="This game is still going"
        body="Come back once it is over — the summary is written the moment it ends."
        action={<Link href={`/g/${gameId}`}>Back to the board</Link>}
      />
    );
  }
  if (!snapshot.seat) {
    return (
      <Empty
        icon={LogIn}
        title="You were not playing in this game"
        body="The summary is written from a player's chair. You can still watch the board."
        action={<Link href={`/g/${gameId}`}>See the board</Link>}
      />
    );
  }

  const mySeat: Seat = snapshot.seat;
  const theirSeat: Seat = mySeat === "white" ? "black" : "white";
  const players = { white: snapshot.white, black: snapshot.black };
  const negotiating = phase === "offered" || phase === "received";

  return (
    <main
      className="mx-auto w-full max-w-[64rem] flex-1 px-3 py-4 sm:px-5 sm:py-6"
      data-board={boardTheme}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* The verdict and the doors, first on a phone and beside the board on a
            desktop. The rematch takes the whole footer while it is being negotiated
            — it is the only thing here waiting on a decision. */}
        <section className="surface-raised rounded-xl lg:order-2">
          <GameResultCard snapshot={snapshot} className="px-5 pt-6" />

          <dl className="mx-5 mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-4 text-xs">
            <PlayerLine seat="white" player={players.white} you={mySeat === "white"} />
            <PlayerLine seat="black" player={players.black} you={mySeat === "black"} />
            <dt className="text-muted-foreground">Time control</dt>
            <dd className="tnum text-end font-mono">
              {timeControlLabel(snapshot)}
              {snapshot.rated ? " · rated" : " · casual"}
            </dd>
            <dt className="text-muted-foreground">Moves</dt>
            <dd className="tnum text-end font-mono">{Math.ceil(snapshot.seq / 2)}</dd>
          </dl>

          <div className="mt-5 flex flex-col gap-2 border-t bg-muted/20 p-4">
            <RematchControls snapshot={snapshot} phase={phase} layout="stack" />
            {phase === "declined" && (
              <p className="text-center text-xs text-muted-foreground">
                {snapshot.rematchDeclinedBy === mySeat
                  ? "You declined a rematch."
                  : `${players[theirSeat]?.username ?? "Your opponent"} declined a rematch.`}
              </p>
            )}
            {/* Analysis leads unless a rematch is on the table. Whichever action is
                actually live should be the one that looks like the answer. */}
            <Button
              asChild
              size="lg"
              variant={negotiating ? "outline" : "default"}
              className="h-11"
            >
              <Link href={`/g/${gameId}/analyse`}>
                <Sparkles className="size-4" aria-hidden /> Analyse this game
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/play/friend">
                <Swords className="size-4" aria-hidden /> New game
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="w-full text-xs">
              <Link href={`/g/${gameId}`}>
                <ChevronLeft className="size-3.5" aria-hidden /> Back to the board
              </Link>
            </Button>
          </div>
        </section>

        {/* The final position and the moves that reached it. The board is inert: this
            is a record, and anything you could do to it belongs to the analysis. */}
        <section className="min-w-0 lg:order-1">
          <div className="mx-auto w-full max-w-[28rem] lg:max-w-none">
            <ChessBoard
              fen={board.fen()}
              flipped={mySeat === "black"}
              lastMove={lastMoveOf(board)}
              checkSquare={checkSquareOf(board)}
            />
          </div>
          <div className="surface-raised mt-4 flex h-[16rem] flex-col rounded-xl lg:h-[20rem]">
            <h2 className="shrink-0 border-b px-3 py-2 text-sm font-semibold">Moves</h2>
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0">
                {rows.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No moves were played.
                  </p>
                ) : (
                  <MoveList rows={rows} activePly={snapshot.seq} />
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PlayerLine({
  seat,
  player,
  you,
}: {
  seat: Seat;
  player: PublicPlayer | null;
  you: boolean;
}) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/25",
            seat === "white" ? "bg-piece-light" : "bg-piece-dark",
          )}
          aria-hidden
        />
        {seat === "white" ? "White" : "Black"}
      </dt>
      <dd className="min-w-0 truncate text-end font-medium">
        {player?.username ?? "Unknown"}
        {player && (
          <span className="tnum ms-1.5 font-mono text-2xs font-normal text-muted-foreground">
            {player.rating}
            {player.provisional && "?"}
          </span>
        )}
        {you && <span className="ms-1.5 text-2xs font-normal text-muted-foreground">you</span>}
      </dd>
    </>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Swords;
  title: string;
  body: string;
  action: React.ReactElement;
}) {
  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-16 text-center">
      <div>
        <Icon className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {body}
        </p>
        <Button asChild className="mt-5">
          {action}
        </Button>
      </div>
    </main>
  );
}

/** "10 min", "15 | 10", or the raw numbers for a control the list does not name. */
function timeControlLabel(snapshot: Pick<GameSnapshot, "initialMs" | "incrementMs">) {
  const named = TIME_CONTROLS.find(
    (control) =>
      control.initialMs === snapshot.initialMs &&
      control.incrementMs === snapshot.incrementMs,
  );
  if (named) return named.label;
  const minutes = Math.round(snapshot.initialMs / 60_000);
  const increment = Math.round(snapshot.incrementMs / 1000);
  return increment ? `${minutes} | ${increment}` : `${minutes} min`;
}
