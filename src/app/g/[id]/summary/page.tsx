import { AppShell } from "@/components/shell/app-shell";
import { SummaryView } from "./summary-view";

export const metadata = { title: "Game summary · AI Chess Coach" };

export default async function SummaryPage({ params }: PageProps<"/g/[id]/summary">) {
  const { id } = await params;
  const gameId = id.toUpperCase();
  return (
    <AppShell>
      {/* Keyed for the same reason the board is: a rematch agreed from here navigates
          to a different game, and this view's "have I seen it without a pointer yet"
          ref must not survive into it. */}
      <SummaryView key={gameId} gameId={gameId} />
    </AppShell>
  );
}
