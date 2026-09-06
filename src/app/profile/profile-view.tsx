"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Profile = {
  username: string;
  rating: { value: number; provisional: boolean };
  record: { games: number; wins: number; losses: number; draws: number };
};

export function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/me", { cache: "no-store" }).then(async (response) => {
      if (!active) return;
      if (response.status === 401) return setSignedOut(true);
      if (response.ok) setProfile(await response.json());
    });
    return () => {
      active = false;
    };
  }, []);

  if (signedOut) {
    return (
      <main className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-4 py-16 text-center">
        <div>
          <h1 className="text-xl font-semibold">Your chess profile</h1>
          <p className="mt-2 font-serif text-muted-foreground">
            Sign in to see your multiplayer record.
          </p>
          <Button asChild className="mt-5">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  const record = profile?.record;
  const rate = record?.games ? Math.round((record.wins / record.games) * 100) : 0;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/12 text-primary">
            <Trophy className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{profile?.username ?? "Your profile"}</h1>
            <p className="text-sm text-muted-foreground">Multiplayer game record</p>
          </div>
          {profile && (
            <span className="ms-auto tnum font-mono text-lg" title="Rating">
              {profile.rating.value}
              {profile.rating.provisional && "?"}
            </span>
          )}
        </div>
      </header>
      <section className="mt-5 grid gap-3 sm:grid-cols-4" aria-label="Game statistics">
        <Stat label="Games played" value={record?.games} icon={Swords} />
        <Stat label="Wins" value={record?.wins} />
        <Stat label="Losses" value={record?.losses} />
        <Stat label="Draws" value={record?.draws} />
      </section>
      <section className="mt-5 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Win rate</h2>
        </div>
        <p className="tnum mt-3 text-3xl font-semibold">{rate}%</p>
        <p className="mt-1 font-serif text-sm text-muted-foreground">Across completed multiplayer games.</p>
      </section>
    </main>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value?: number; icon?: typeof Swords }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </div>
      <p className="tnum mt-2 text-2xl font-semibold">{value ?? "—"}</p>
    </div>
  );
}
