import { AppShell } from "@/components/shell/app-shell";
import { QueueView } from "./queue-view";

export const metadata = { title: "Play a stranger · AI Chess Coach" };

export default function PlayOnlinePage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
        <QueueView />
      </main>
    </AppShell>
  );
}
