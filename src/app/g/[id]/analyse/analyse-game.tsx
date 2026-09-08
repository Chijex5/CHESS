"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Cpu, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fetchSnapshot } from "@/lib/multiplayer/client";
import { analyseFinishedGame } from "@/lib/game/controller";
import { archive, isRestorable } from "@/lib/archive";
import { restoreReview, saveFinishedGame } from "@/lib/archive/working-set";
import type { GameResult } from "@/lib/chess/types";
import type { GameSnapshot } from "@/lib/multiplayer/protocol";

/* The bridge between the two halves of the app. An online game is played with no
   engine running; this is where the engine finally sees it, so that the review page
   and the drills — which only ever read the local stores — work on it without
   knowing it came from a server.

   It is a page rather than something that happens quietly in the background because
   it takes real time: two searches per move at depth 14, sequentially, on one worker.
   A progress bar is honest about that; a spinner would not be. */
export function AnalyseGame({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const controller = new AbortController();

    void (async () => {
      const snapshot = await fetchSnapshot(gameId);
      if (!snapshot) {
        setError("That game could not be found.");
        return;
      }
      if (snapshot.status !== "finished") {
        setError("That game is not over yet.");
        return;
      }
      if (!snapshot.seat) {
        setError("You were not playing in that game.");
        return;
      }

      /* Already analysed once, on this device or another: the stored review restores in
         a round trip where re-running the engine would take the better part of a minute
         and land on the same numbers. */
      const store = await archive();
      const stored = await store.review(gameId);
      if (isRestorable(stored)) {
        restoreReview(gameId, stored);
        if (!controller.signal.aborted) router.replace(`/g/${gameId}/review`);
        return;
      }

      try {
        await analyseFinishedGame({
          gameId,
          sans: snapshot.sans,
          playerColor: snapshot.seat === "white" ? "w" : "b",
          result: resultOf(snapshot),
          onProgress: (done, total) => setProgress({ done, total }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        /* The server filed the result when the game ended, knowing nothing about how
           well either side played. This is the other half of that row: the accuracy, the
           quality tally, the weaknesses, and the analysis itself, so that opening this
           review again — here or on another device — costs a fetch rather than eighty
           searches. */
        const opponent = snapshot.seat === "white" ? snapshot.black : snapshot.white;
        await saveFinishedGame({
          id: gameId,
          source: "online",
          opponent: opponent?.username ?? "Unknown",
          opponentRating: opponent?.rating ?? null,
          ending: snapshot.ending,
          initialMs: snapshot.initialMs,
          incrementMs: snapshot.incrementMs,
          rated: snapshot.rated,
          playedAt: snapshot.endedAt ?? Date.now(),
        });

        router.replace(`/g/${gameId}/review`);
      } catch (thrown) {
        setError(
          thrown instanceof Error ? thrown.message : "The engine could not be started.",
        );
      }
    })();

    return () => controller.abort();
  }, [gameId, router]);

  if (error) {
    return (
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <TriangleAlert className="mx-auto size-7 text-q-inaccuracy-ink" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Nothing to analyse</h1>
          <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
            {error}
          </p>
          <Button asChild className="mt-5">
            <Link href={`/g/${gameId}`}>Back to the game</Link>
          </Button>
        </div>
      </main>
    );
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const status = progress.total
    ? pct < 35 ? "Checking the opening and early choices." : pct < 75 ? "Finding tactical moments and better moves." : "Preparing your personalised review."
    : "Starting the engine…";

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-16 text-center">
      <div className="w-full">
        <Cpu className="mx-auto size-7 animate-pulse text-primary" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">Working through the game</h1>
        <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
          {status}
        </p>

        <Progress value={pct} className="mt-6" />
        <p className="tnum mt-2 font-mono text-2xs text-muted-foreground">
          {progress.total
            ? `${progress.done} of ${progress.total} positions`
            : "Starting the engine…"}
        </p>
      </div>
    </main>
  );
}

/** The online result, in the shape the review page and the game-over dialog expect. */
function resultOf(snapshot: GameSnapshot): GameResult {
  const won = snapshot.winner === "draw" ? null : snapshot.winner === snapshot.seat;
  const opponent = snapshot.seat === "white" ? snapshot.black : snapshot.white;
  const player = snapshot.seat === "white" ? snapshot.white : snapshot.black;
  return {
    outcome:
      snapshot.winner === "draw"
        ? "Draw"
        : `${snapshot.winner === "white" ? "White" : "Black"} won`,
    detail: opponent
      ? `${snapshot.ending ?? "game over"} · against ${opponent.username}`
      : (snapshot.ending ?? "game over"),
    playerWon: won,
    ending: snapshot.ending ?? undefined,
    playerName: player?.username,
    opponentName: opponent?.username,
  };
}
