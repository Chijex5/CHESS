import { AppHeader } from "@/components/shell/app-header";
import { ReviewView } from "@/components/review/review-view";

export const metadata = { title: "Game review · AI Chess Coach" };

export default function ReviewPage() {
  return (
    <>
      <AppHeader />
      <ReviewView />
    </>
  );
}
