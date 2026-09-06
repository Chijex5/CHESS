"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createGame } from "@/lib/multiplayer/client";
import { TIME_CONTROLS, timeControlFor, type TimeControlId } from "@/lib/game/time-controls";
import type { Seat } from "@/lib/multiplayer/protocol";

/* An online game always has a clock, so "No clock" is not offered here. Without one
   there is no flag-fall, and flag-fall is the only thing that resolves a game whose
   opponent has closed their laptop — the alternative is a row that stays `active`
   forever and a player who can never start another. */
const CLOCKS = TIME_CONTROLS.filter((control) => control.initialMs > 0);

export function CreateGame() {
  const router = useRouter();
  const [timeControl, setTimeControl] = useState<TimeControlId>("rapid10");
  const [side, setSide] = useState<Seat | "random">("random");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    const id = await createGame({ side, timeControl });
    if (!id) {
      setCreating(false);
      setError("Could not create the game. Check you are still signed in.");
      return;
    }
    /* No intermediate "here is your link" step. The board shows the invite while the
       other seat is empty, so the host waits where they will play — and `creating`
       stays true through the navigation, because releasing it would flash the form
       again on the way out. */
    router.push(`/g/${id}`);
  };

  return (
    <div className="mt-6 space-y-5">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Clock</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full justify-start gap-1 [&>button]:h-9 [&>button]:flex-1 [&>button]:text-xs"
          value={timeControl}
          onValueChange={(value) => value && setTimeControl(value as TimeControlId)}
        >
          {CLOCKS.map((control) => (
            <ToggleGroupItem key={control.id} value={control.id}>
              {control.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="pt-0.5 text-2xs leading-snug text-muted-foreground">
          {timeControlFor(timeControl).note}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">You play</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          className="w-full justify-start gap-1 [&>button]:h-9 [&>button]:flex-1 [&>button]:text-xs"
          value={side}
          onValueChange={(value) => value && setSide(value as Seat | "random")}
        >
          <ToggleGroupItem value="white">White</ToggleGroupItem>
          <ToggleGroupItem value="black">Black</ToggleGroupItem>
          <ToggleGroupItem value="random">Random</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Stated before the game rather than discovered during it. A player who
          expects the hint button to be there will go looking for it. */}
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-xs font-medium">No engine help in an online game</p>
        <p className="mt-1 font-serif text-xs leading-relaxed text-muted-foreground">
          The hint button, the evaluation bar and the coach are all off while you
          play — against a person they would be cheating. Everything arrives when the
          game ends, including the drills from your own mistakes.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button size="lg" className="w-full" disabled={creating} onClick={() => void create()}>
        {creating ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        Create the game
      </Button>
    </div>
  );
}
