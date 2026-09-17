import { AppShell } from "@/components/shell/app-shell";
import { DrillView } from "@/components/practise/drill-view";

export const metadata = { title: "Practise · AI Chess Coach" };

export default function PractisePage() {
  return (
    <AppShell>
      <DrillView />
    </AppShell>
  );
}
