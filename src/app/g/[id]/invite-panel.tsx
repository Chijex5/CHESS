"use client";

import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Shown on the board itself, over the empty half of it, while the seat is unfilled.
   The host used to be left on the create screen holding a link with a "go to the
   board" button — which meant the two things they needed at once, the invite and the
   board they were about to play on, were on different pages.

   It disappears the moment someone sits down. Neither clock is running until then:
   `startedAt` is set by the join, and `snapshot()` only projects time for an active
   game, so a host who makes a game and walks away has lost nothing. */
export function InvitePanel({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/g/${gameId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Permission refused; the field below is still selectable.
    }
  };

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-4 shadow-lg">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
          Waiting for your opponent
        </p>
        <p className="mt-1 font-serif text-sm leading-relaxed text-muted-foreground">
          Send them either of these. Nobody&apos;s clock starts until they arrive.
        </p>

        <div className="mt-3.5">
          <p className="eyebrow">Code</p>
          <p className="tnum mt-1 select-all font-mono text-2xl font-semibold tracking-[0.18em]">
            {gameId}
          </p>
        </div>

        <div className="mt-3">
          <p className="eyebrow">Link</p>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 font-mono text-xs"
              aria-label="Invite link"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-8 shrink-0"
              onClick={() => void copy()}
            >
              {copied ? (
                <Check className="size-3.5 text-q-best-ink" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

