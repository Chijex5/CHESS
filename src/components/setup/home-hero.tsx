"use client";

import Link from "next/link";
import { ChevronRight, Settings2, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/board/chess-board";
import { opponentFor } from "@/lib/engine/opponents";
import { useSettings } from "@/lib/store/settings-store";
import { START_FEN } from "@/lib/chess/fen";

const SIDE_LABEL = {
  white: "you play White",
  black: "you play Black",
  random: "random colour",
} as const;

/* Two doors, not a form. The old landing page asked for six decisions — colour,
   strength, thinking time, sensitivity, verbosity, theme — before anyone had seen
   a single move. All of them live in Settings now, with sane defaults, and this
   page answers one question: play, or change how it plays. */
export function HomeHero() {
  const settings = useSettings();

  return (
    <div
      className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12"
      data-board={settings.boardTheme}
    >
      <div className="order-2 lg:order-1">
        <div className="mx-auto w-full max-w-[31rem]">
          {/* Flipped to match the seat you have chosen, so the one setting that
              changes what you'll see is visible without opening anything. */}
          <ChessBoard fen={START_FEN} flipped={settings.side === "black"} />
        </div>
        <ol className="mx-auto mt-5 grid max-w-[31rem] gap-2 sm:grid-cols-3">
          {[
            "Stockfish plays every move, in your browser.",
            "It reports the eval swing and the move it wanted.",
            "The coach explains why that move was better.",
          ].map((step, i) => (
            <li
              key={step}
              className="rounded-lg border bg-card px-2.5 py-2 font-serif text-xs leading-relaxed text-muted-foreground"
            >
              <span className="me-1 font-sans font-medium text-foreground">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="order-1 lg:order-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Play a real engine. Find out why you lost.
        </h1>
        <p className="mt-2.5 font-serif text-base leading-relaxed text-muted-foreground">
          Stockfish supplies the moves and the numbers. The coach supplies the
          reason — tied to the eval swing it actually measured.
        </p>

        <div className="mt-6 space-y-2.5">
          <Button asChild size="lg" className="h-16 w-full justify-start gap-3 px-4">
            <Link href="/play">
              <Swords className="size-5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-base font-semibold leading-none">Play</span>
                {/* Settings are read from localStorage, so the server renders the
                    defaults and the client the saved game — same element, two
                    legitimate values. */}
                <span
                  className="text-2xs font-normal leading-none opacity-80"
                  suppressHydrationWarning
                >
                  {opponentFor(settings.elo).name} {settings.elo} ·{" "}
                  {SIDE_LABEL[settings.side]}
                </span>
              </span>
              <ChevronRight className="ms-auto size-4 shrink-0 opacity-70" aria-hidden />
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 w-full justify-start gap-3 px-4"
          >
            <Link href="/settings">
              <Settings2 className="size-4 shrink-0" aria-hidden />
              Settings
              <ChevronRight className="ms-auto size-4 shrink-0 opacity-70" aria-hidden />
            </Link>
          </Button>
        </div>

        {/* Multiplayer is planned, so it gets an honest placeholder rather than a
            missing feature people go looking for. */}
        <div className="mt-2.5 flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 text-sm text-muted-foreground">
          <Users className="size-4 shrink-0" aria-hidden />
          Play a friend
          <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-2xs font-medium">
            Soon
          </span>
        </div>

        <p className="mt-5 text-2xs leading-relaxed text-muted-foreground">
          The engine runs client-side. Nothing about your game leaves the browser
          until the coach is asked for an explanation.
        </p>
      </div>
    </div>
  );
}
