import { AppHeader } from "@/components/shell/app-header";
import { QueueView } from "./queue-view";

export const metadata = { title: "Play a stranger · AI Chess Coach" };

export default function PlayOnlinePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <QueueView />
      </main>
    </>
  );
}
