"use client";

import Link from "next/link";
import { ChevronRight, Globe, Settings2, Swords, Users } from "lucide-react";
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

/* ── The front door, for somebody who has not been here ───────────────────────
   A signed-in player gets the lobby. This is the other case, and it genuinely needs
   to make a claim: "AI chess coach" is not a category anyone arrives already
   understanding, and a stranger dropped into a dashboard with no games and no rating
   has been shown nothing.

   So the promise stays — but as three lines and a board, not a headline plus a
   three-step explainer plus a paragraph about where the WebAssembly runs. The board
   is the argument. Everything the old page said in prose is still true and is now
   read on the pages where it applies.
   ─────────────────────────────────────────────────────────────────────────── */
export function Pitch() {
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
      </div>

      <div className="order-1 lg:order-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Play a real engine. Find out why you lost.
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          Stockfish supplies every move and every number, in your browser. The coach
          supplies the reason — tied to the evaluation swing the engine actually
          measured.
        </p>

        <div className="mt-6 space-y-2.5">
          <Button asChild size="xl" className="w-full justify-start">
            <Link href="/play">
              <Swords className="size-5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="leading-none">Play</span>
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
              <ChevronRight className="ms-auto size-5 shrink-0 opacity-70" aria-hidden />
            </Link>
          </Button>

          {/* Both real. Signing in is only required from here down — the engine game
              above needs no account, which is why it is listed first. */}
          <div className="flex gap-2.5">
            <Button asChild size="lg" variant="outline" className="flex-1 justify-start">
              <Link href="/play/online">
                <Globe className="size-4 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-sm leading-tight">A stranger</span>
                  <span className="text-2xs font-normal leading-tight opacity-70">
                    Rated
                  </span>
                </span>
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="flex-1 justify-start">
              <Link href="/play/friend">
                <Users className="size-4 shrink-0" aria-hidden />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="text-sm leading-tight">A friend</span>
                  <span className="text-2xs font-normal leading-tight opacity-70">
                    By link
                  </span>
                </span>
              </Link>
            </Button>
          </div>

          <Button asChild size="lg" variant="ghost" className="w-full justify-start">
            <Link href="/settings">
              <Settings2 className="size-4 shrink-0" aria-hidden />
              Settings
              <ChevronRight className="ms-auto size-4 shrink-0 opacity-70" aria-hidden />
            </Link>
          </Button>
        </div>

        <p className="mt-5 text-2xs leading-relaxed text-muted-foreground">
          The engine runs client-side, and no account is needed to play it. Playing a
          person needs one, and no engine help is available while you do.
        </p>
      </div>
    </div>
  );
}
