import Link from "next/link";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings · AI Chess Coach" };

export default function SettingsPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[80rem] flex-1 px-3 py-6 sm:px-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saved as you change them. Strength and colour apply to your next game.
            </p>
          </div>
          <Button asChild>
            <Link href="/play">
              <Swords className="size-4" aria-hidden /> Play
            </Link>
          </Button>
        </div>
        <SettingsView />
      </main>
    </AppShell>
  );
}
