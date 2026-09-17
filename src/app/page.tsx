import { AppShell } from "@/components/shell/app-shell";
import { HomeHero } from "@/components/setup/home-hero";

export default function HomePage() {
  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-[76rem] flex-1 items-center px-3 py-8 sm:px-5">
        <HomeHero />
      </main>
    </AppShell>
  );
}
