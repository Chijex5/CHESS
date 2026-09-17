import { AppShell } from "@/components/shell/app-shell";
import { AnalyseGame } from "./analyse-game";

export const metadata = { title: "Analysing · AI Chess Coach" };

export default async function AnalysePage({ params }: PageProps<"/g/[id]/analyse">) {
  const { id } = await params;
  return (
    <AppShell>
      <AnalyseGame gameId={id.toUpperCase()} />
    </AppShell>
  );
}
