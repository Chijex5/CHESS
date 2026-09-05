"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/board/chess-board";
import { SettingsPanel } from "@/components/setup/settings-panel";
import { useSettings } from "@/lib/store/settings-store";
import { START_FEN } from "@/lib/chess/fen";

export function SettingsView() {
  const settings = useSettings();

  return (
    <div
      className="grid gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]"
      data-board={settings.boardTheme}
    >
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Defaults</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={settings.reset}
          >
            <RotateCcw className="size-3.5" aria-hidden /> Reset
          </Button>
        </div>
        <SettingsPanel value={settings} onChange={(next) => settings.set(next)} />
      </div>

      <div>
        <h2 className="mb-2.5 eyebrow">
          Preview
        </h2>
        <div className="mx-auto w-full max-w-[32rem]">
          <ChessBoard
            fen={START_FEN}
            flipped={settings.side === "black"}
            arrows={[
              { from: "e2", to: "e4", kind: "best" },
              { from: "d2", to: "d4", kind: "played" },
            ]}
          />
        </div>
        <p className="mx-auto mt-3 max-w-[32rem] font-serif text-sm leading-relaxed text-muted-foreground">
          Red is the move played, green is the move the engine wanted. Board and
          piece colours follow FIDE&apos;s guidance for tournament equipment: dull
          finish, cream against ebonised walnut, and coordinates on the frame
          rather than inside the squares.
        </p>
      </div>
    </div>
  );
}
