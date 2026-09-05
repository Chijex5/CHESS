"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/store/settings-store";

/** Mute lives in the header because that is where a player reaches for it —
 *  three taps into a settings sheet is not where you silence a game. */
export function SoundToggle() {
  const enabled = useSettings((s) => s.soundEnabled);
  const set = useSettings((s) => s.set);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8"
      onClick={() => set({ soundEnabled: !enabled })}
      aria-pressed={enabled}
      title={enabled ? "Mute board sound" : "Unmute board sound"}
    >
      {enabled ? (
        <Volume2 className="size-4" aria-hidden />
      ) : (
        <VolumeX className="size-4 text-muted-foreground" aria-hidden />
      )}
      <span className="sr-only">{enabled ? "Mute board sound" : "Unmute board sound"}</span>
    </Button>
  );
}
