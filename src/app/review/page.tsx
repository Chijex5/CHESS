import { AppShell } from "@/components/shell/app-shell";
import { ReviewView } from "@/components/review/review-view";

export const metadata = { title: "Game review · AI Chess Coach" };

export default function ReviewPage() {
  return (
    <AppShell>
      <ReviewView />
    </AppShell>
  );
}
