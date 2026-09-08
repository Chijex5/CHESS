import { AppHeader } from "@/components/shell/app-header";
import { OnlineView } from "./online-view";

export const metadata = { title: "Online game · AI Chess Coach" };

export default async function OnlineGamePage({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  const gameId = id.toUpperCase();
  return (
    <>
      <AppHeader />
      {/* Keyed on the id so that arriving at a rematch remounts the board rather than
          re-parameterising it. The view holds a dozen pieces of state that are about
          *this* game — the selected square, whether the result dialog has been shown,
          whether a seat has been claimed — and a rematch is a different game, so
          keeping any of it would be a bug looking for somewhere to happen. */}
      <OnlineView key={gameId} gameId={gameId} />
    </>
  );
}
