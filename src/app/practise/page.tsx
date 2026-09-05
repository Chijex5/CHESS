import { AppHeader } from "@/components/shell/app-header";
import { DrillView } from "@/components/practise/drill-view";

export const metadata = { title: "Practise · AI Chess Coach" };

export default function PractisePage() {
  return (
    <>
      <AppHeader />
      <DrillView />
    </>
  );
}
