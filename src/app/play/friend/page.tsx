import { AppHeader } from "@/components/shell/app-header";
import { CreateGame } from "./create-game";

export const metadata = { title: "Play a friend · AI Chess Coach" };

export default function PlayFriendPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Play a friend</h1>
        <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
          Pick a clock and you go straight to the board, where the link and the code
          are waiting. Whoever opens it first takes the other seat.
        </p>
        <CreateGame />
      </main>
    </>
  );
}
