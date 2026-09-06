import { AppHeader } from "@/components/shell/app-header";
import { AnalyseGame } from "./analyse-game";

export const metadata = { title: "Analysing · AI Chess Coach" };

export default async function AnalysePage({ params }: PageProps<"/g/[id]/analyse">) {
  const { id } = await params;
  return (
    <>
      <AppHeader />
      <AnalyseGame gameId={id.toUpperCase()} />
    </>
  );
}
