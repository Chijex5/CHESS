"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CapturedPieces } from "./captured-pieces";
import { OnlineClock } from "./online-clock";
import { ConnectionBars } from "./connection-bars";
import type { PublicPlayer, Seat } from "@/lib/multiplayer/protocol";
import type { PieceType } from "@/lib/chess/types";

/* A real person's row. The engine version says "Stockfish 18 · 1600 · Casual" and
   never changes; this one has to cope with a seat that is empty because nobody has
   accepted the invite yet, a rating that is provisional, and a connection that may
   have dropped. Those are the three things a player actually wants to know about the
   other side of the board. */
export function OpponentStrip({
  player,
  seat,
  captured,
  advantage,
  active,
  waiting = false,
  showConnection = false,
  you = false,
  className,
}: {
  player: PublicPlayer | null;
  seat: Seat;
  captured: PieceType[];
  advantage?: number;
  active?: boolean;
  /** No one has taken this seat yet. */
  waiting?: boolean;
  /** Show the connection meter. Only ever on your own row: it measures *your* link,
   *  and putting it on theirs would be a green light that means nothing. */
  showConnection?: boolean;
  you?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-lg border bg-card px-3 transition-colors",
        active ? "border-primary/45 bg-primary/[0.06]" : "border-border",
        className,
      )}
    >
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/25",
          seat === "white" ? "bg-piece-light" : "bg-piece-dark",
          active && "ring-2 ring-primary/60",
        )}
        aria-hidden
      />

      {waiting ? (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Waiting for an opponent
        </span>
      ) : (
        <>
          <span className="truncate text-sm font-medium">
            {player?.username ?? "Unknown"}
          </span>
          {player && (
            <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
              {player.rating}
              {/* A wide deviation means the number is a guess, and a guess printed
                  like a fact is worse than no number. */}
              {player.provisional && "?"}
            </span>
          )}
          {you && <span className="shrink-0 text-2xs text-muted-foreground">you</span>}
        </>
      )}

      {(captured.length > 0 || (advantage ?? 0) > 0) && (
        <CapturedPieces
          pieces={captured}
          color={seat === "white" ? "b" : "w"}
          advantage={advantage}
          className="min-w-0 shrink"
        />
      )}

      <span className="flex-1" aria-hidden />

      {/* A meter rather than a word. "Connecting" told you nothing about a link that
          was up and slow, which is the state that actually costs you a game. */}
      {showConnection && <ConnectionBars className="me-1" />}

      <OnlineClock seat={seat} />
    </div>
  );
}
