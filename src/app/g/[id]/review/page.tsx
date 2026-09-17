import { AppShell } from "@/components/shell/app-shell";
import { ReviewView } from "@/components/review/review-view";

export const metadata = { title: "Game review · AI Chess Coach" };

export default async function GameReviewPage({ params }: PageProps<"/g/[id]/review">) {
  const { id } = await params;
  return <AppShell><ReviewView gameId={id.toUpperCase()} /></AppShell>;
}
