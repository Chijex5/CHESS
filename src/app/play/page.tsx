import { GameHeader } from "@/components/shell/game-header";
import { PlayView } from "@/components/game/play-view";

export default function PlayPage() {
  return (
    <>
      <GameHeader label="Play the engine" />
      <PlayView />
    </>
  );
}
