import { AppHeader } from "@/components/shell/app-header";
import { HomeHero } from "@/components/setup/home-hero";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[76rem] flex-1 items-center px-3 py-8 sm:px-5">
        <HomeHero />
      </main>
    </>
  );
}
