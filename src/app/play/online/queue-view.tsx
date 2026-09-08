"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TIME_CONTROLS, timeControlFor, type TimeControlId } from "@/lib/game/time-controls";
import { pairingWindowLabel } from "@/lib/multiplayer/window";

const CLOCKS = TIME_CONTROLS.filter((control) => control.initialMs > 0);

/** How often the client heartbeats. Also how long a pairing takes to reach the player
 *  who did not trigger it — short enough not to notice, long enough not to hammer. */
const BEAT_MS = 2_000;

/* ── Looking for an opponent ───────────────────────────────────────────────────
   The searching state is where a matchmaking queue either feels alive or feels
   broken, and the difference is whether it tells you anything. This one shows how
   long you have waited, how wide it is currently looking, and how many people are in
   the queue — so a slow match reads as a small player base rather than a bug.
   ─────────────────────────────────────────────────────────────────────────── */
export function QueueView() {
  const router = useRouter();
  const [timeControl, setTimeControl] = useState<TimeControlId>("rapid10");
  const [searching, setSearching] = useState(false);
  const [since, setSince] = useState(0);
  const [waited, setWaited] = useState(0);
  const [depth, setDepth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /* The heartbeat and the leave-on-unmount both need the *current* time control, and
     both are set up in effects that must not restart when it changes. Written in an
     effect rather than during render, which React forbids. */
  const control = useRef(timeControl);
  useEffect(() => {
    control.current = timeControl;
  }, [timeControl]);

  /* Leaving the queue on unmount is what keeps it honest: a queue full of people who
     navigated away pairs live players against ghosts. The server sweeps stale entries
     too, because a closed laptop never gets to run this. */
  const leave = useCallback(() => {
    void fetch(`/api/queue?timeControl=${control.current}`, { method: "DELETE" });
  }, []);

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;

    const beat = async () => {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeControl: control.current }),
      });
      if (cancelled) return;
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Sign in to play a stranger."
            : "Matchmaking is unavailable right now.",
        );
        setSearching(false);
        return;
      }
      const body = (await response.json()) as
        | { status: "matched"; gameId: string }
        | { status: "waiting"; waiting: number };

      if (body.status === "matched") {
        cancelled = true;
        router.push(`/g/${body.gameId}`);
        return;
      }
      setDepth(body.waiting);
    };

    void beat();
    const timer = setInterval(() => void beat(), BEAT_MS);
    const ticker = setInterval(() => setWaited(Date.now() - since), 250);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(ticker);
    };
  }, [searching, since, router]);

  // Also on a real navigation away, which unmount alone does not always catch.
  useEffect(() => {
    if (!searching) return;
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [searching, leave]);

  if (searching) {
    const seconds = Math.floor(waited / 1000);
    return (
      <div className="grid flex-1 place-items-center py-10 text-center">
        <div>
          <Search className="mx-auto size-7 animate-pulse text-primary" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">Looking for an opponent</h1>
          <p className="tnum mt-1 font-mono text-2xl font-semibold">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>

          <p className="mt-3 font-serif text-sm leading-relaxed text-muted-foreground">
            {timeControlFor(timeControl).label} · searching{" "}
            {pairingWindowLabel(waited)} of your rating.
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground">
            <Users className="size-3" aria-hidden />
            {depth === 0
              ? "You are the only one waiting"
              : depth === 1
                ? "You are the only one waiting"
                : `${depth} players waiting`}
          </p>

          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              leave();
              setSearching(false);
            }}
          >
            <X className="size-4" aria-hidden /> Stop looking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Play a stranger</h1>
      <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
        Paired by rating. These games are rated, so they move your number — and the
        engine stays out of them entirely, same as playing a friend.
      </p>

      <div className="mt-6 space-y-1.5">
        <Label className="text-sm font-medium">Clock</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full justify-start gap-1 [&>button]:h-9 [&>button]:flex-1 [&>button]:text-xs"
          value={timeControl}
          onValueChange={(value) => value && setTimeControl(value as TimeControlId)}
        >
          {CLOCKS.map((clock) => (
            <ToggleGroupItem key={clock.id} value={clock.id}>
              {clock.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="pt-0.5 text-2xs leading-snug text-muted-foreground">
          {timeControlFor(timeControl).note}
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <Button
        size="lg"
        className="mt-6 w-full"
        onClick={() => {
          setError(null);
          setSince(Date.now());
          setWaited(0);
          setSearching(true);
        }}
      >
        <Loader2 className="size-4" aria-hidden /> Find an opponent
      </Button>
    </div>
  );
}
