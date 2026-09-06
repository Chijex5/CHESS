import { AppHeader } from "@/components/shell/app-header";
import { OnlineView } from "./online-view";

export const metadata = { title: "Online game · AI Chess Coach" };

export default async function OnlineGamePage({ params }: PageProps<"/g/[id]">) {
  const { id } = await params;
  return (
    <>
      <AppHeader />
      <OnlineView gameId={id.toUpperCase()} />
    </>
  );
}
