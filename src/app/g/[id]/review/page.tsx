import { AppHeader } from "@/components/shell/app-header";
import { ReviewView } from "@/components/review/review-view";

export const metadata = { title: "Game review · AI Chess Coach" };

export default async function GameReviewPage({ params }: PageProps<"/g/[id]/review">) {
  const { id } = await params;
  return <><AppHeader /><ReviewView gameId={id.toUpperCase()} /></>;
}
