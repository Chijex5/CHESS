"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Swords, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sendOffer } from "@/lib/multiplayer/client";
import type { GameSnapshot, RematchPhase } from "@/lib/multiplayer/protocol";

/* ── Asking for another one ───────────────────────────────────────────────────
   The moment a game ends is the only moment a rematch is worth offering, and until
   now the only route out of it was the create screen — which meant a new link, a new
   copy-paste, and a person on the other side who had already gone.

   One component for the two places that need it: the dialog that opens on the result,
   and the line under the board once that dialog has been dismissed. They differ in
   size and nothing else, so the negotiation lives here rather than twice.
   ─────────────────────────────────────────────────────────────────────────── */
export function RematchControls({
  snapshot,
  phase,
  layout = "row",
  className,
}: {
  snapshot: GameSnapshot;
  /** From `useRematchPhase`, so that this and the line around it are looking at the
   *  same clock. */
  phase: RematchPhase;
  /** "row" sits in the status line under the board; "stack" fills the dialog's
   *  footer, where the rematch is the thing most likely to be wanted. */
  layout?: "row" | "stack";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: string) => {
    setBusy(true);
    const result = await sendOffer(snapshot.id, action);
    setBusy(false);
    /* The accepter learns where to go from its own response rather than waiting for
       the round trip through Redis and back down its event stream. The offerer has no
       response to read, and arrives via the snapshot — see `online-view`. */
    if (result.ok && result.rematchId) router.push(`/g/${result.rematchId}`);
  };

  if (phase === "unavailable" || phase === "expired" || phase === "agreed") return null;

  const stack = layout === "stack";
  const size = stack ? undefined : ("sm" as const);
  const height = stack ? "h-11" : "h-7 text-xs";

  if (phase === "offered") {
    return (
      <div className={cn("flex items-center gap-2", stack && "w-full", className)}>
        <p
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 truncate text-muted-foreground",
            stack ? "text-sm" : "text-xs",
          )}
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          Rematch offered…
        </p>
        <Button
          size={size}
          variant="ghost"
          className={cn("shrink-0", height)}
          disabled={busy}
          onClick={() => void act("decline-rematch")}
        >
          <X className="size-3.5" aria-hidden /> Cancel
        </Button>
      </div>
    );
  }

  if (phase === "received") {
    return (
      <div className={cn("flex items-center gap-2", stack && "w-full", className)}>
        <p
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            stack ? "text-sm" : "text-xs",
          )}
        >
          <Swords className="me-1.5 inline size-3.5 align-[-2px]" aria-hidden />
          They want a rematch.
        </p>
        <Button
          size={size}
          variant={stack ? "default" : "secondary"}
          className={cn("shrink-0", height)}
          disabled={busy}
          onClick={() => void act("accept-rematch")}
        >
          Accept
        </Button>
        <Button
          size={size}
          variant="ghost"
          className={cn("shrink-0", height)}
          disabled={busy}
          onClick={() => void act("decline-rematch")}
        >
          <X className="size-3.5" aria-hidden /> Decline
        </Button>
      </div>
    );
  }

  return (
    <Button
      size={size}
      variant={stack ? "default" : "secondary"}
      className={cn(stack ? "w-full h-11" : "shrink-0 h-7 text-xs", className)}
      disabled={busy}
      onClick={() => void act("offer-rematch")}
    >
      <RotateCcw className="size-4" aria-hidden /> Rematch
      {/* Colours swap, which is the whole difference between a rematch and another
          game against the same person. Worth saying once, where it is decided. */}
      {stack && (
        <span className="ms-1 text-xs font-normal opacity-70">
          · you play {snapshot.seat === "white" ? "black" : "white"}
        </span>
      )}
    </Button>
  );
}
