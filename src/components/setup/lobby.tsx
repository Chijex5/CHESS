"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  CircleDot,
  Cpu,
  Globe,
  Play,
  Settings2,
  Swords,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { archive } from "@/lib/archive";
import { opponentFor } from "@/lib/engine/opponents";
import { useGame } from "@/lib/store/game-store";
import { useSettings } from "@/lib/store/settings-store";
import { statistics, winRate } from "@/lib/game/statistics";
import type { GameSummary } from "@/lib/archive/types";

/* ── The lobby ────────────────────────────────────────────────────────────────
   What a signed-in player sees instead of a sales pitch.

   The old landing page led with a headline, a three-step explainer and a paragraph
   about where the engine runs — all true, all worth saying once, and none of it what
   somebody who already has an account came here for. They came to play, and on a
   game the front door is a lobby: who you are, what you are rated, one control that
   starts a game, and what you last did.

   Every number here already existed. The rating comes from `/api/profile`, the same
   route the profile page uses; the record comes from `statistics()` over the archive,
   which runs client-side so it reads identically from Postgres and from IndexedDB.
   Nothing new is fetched and nothing is computed twice.
   ─────────────────────────────────────────────────────────────────────────── */

type Profile = { username: string; rating: { value: number; provisional: boolean } };

export function Lobby() {
  const settings = useSettings();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [summaries, setSummaries] = useState<GameSummary[] | null>(null);

  /* A game left half-played on this device. The store is persisted, so this survives
     a reload and is the single most likely thing the player wants. */
  const inProgress = useGame(
    (state) => state.status !== "idle" && state.status !== "over" && state.plies.length > 0,
  );
  const plyCount = useGame((state) => state.plies.length);

  useEffect(() => {
    let live = true;
    void fetch("/api/profile", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (live && body?.username) setProfile(body as Profile);
      })
      .catch(() => {
        // A missing profile is a missing line, not an error worth a screen.
      });
    void archive()
      .then((store) => store.summaries(4))
      .then((rows) => {
        if (live) setSummaries(rows);
      })
      .catch(() => {
        if (live) setSummaries([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const record = summaries ? statistics(summaries).record : null;
  const rate = record ? winRate(record) : null;

  return (
    <div className="mx-auto grid w-full max-w-[62rem] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="space-y-4">
        {/* Identity, and the number that changes. The rating is the one value on this
            screen, so it is the one thing in display type. */}
        <section className="surface-raised flex items-center gap-4 rounded-xl p-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Swords className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" suppressHydrationWarning>
              {profile?.username ?? "Your board"}
            </p>
            <p className="text-2xs text-muted-foreground">
              {record && record.games > 0
                ? `${record.games} game${record.games === 1 ? "" : "s"}${
                    rate === null ? "" : ` · ${Math.round(rate * 100)}% won`
                  }`
                : "No games yet"}
            </p>
          </div>
          {profile && (
            <span className="shrink-0 text-end">
              <span className="tnum block font-mono text-display-sm font-semibold">
                {profile.rating.value}
                {profile.rating.provisional && (
                  <span className="text-muted-foreground">?</span>
                )}
              </span>
              <span className="eyebrow">Rating</span>
            </span>
          )}
        </section>

        {/* Resume sits above the ways to start a new one, because an unfinished game
            is the only thing here that would otherwise be lost. */}
        {inProgress && (
          <Button asChild size="xl" className="w-full justify-start">
            <Link href="/play">
              <Play className="size-5 shrink-0" aria-hidden />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="leading-none">Resume your game</span>
                <span className="text-2xs font-normal leading-none opacity-80">
                  {Math.ceil(plyCount / 2)} moves in · vs {opponentFor(settings.elo).name}
                </span>
              </span>
              <ChevronRight className="ms-auto size-5 shrink-0 opacity-70" aria-hidden />
            </Link>
          </Button>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <ModeTile
            href="/play"
            Icon={Cpu}
            title={inProgress ? "New engine game" : "Play the engine"}
            note={`${opponentFor(settings.elo).name} · ${settings.elo}`}
            primary={!inProgress}
          />
          <ModeTile href="/play/online" Icon={Globe} title="A stranger" note="Rated" />
          <ModeTile href="/play/friend" Icon={Users} title="A friend" note="By link" />
        </div>
      </div>

      <aside className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="eyebrow">Recent games</h2>
          {summaries && summaries.length > 0 && (
            <Link
              href="/profile"
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              All
            </Link>
          )}
        </div>

        {summaries === null ? (
          <div className="surface-sunken h-24 rounded-xl" aria-hidden />
        ) : summaries.length === 0 ? (
          <p className="surface-sunken rounded-xl p-4 text-xs text-muted-foreground">
            Games you finish are filed here with their analysis.
          </p>
        ) : (
          <ul className="space-y-2">
            {summaries.map((game) => (
              <li key={game.id}>
                <RecentGame game={game} />
              </li>
            ))}
          </ul>
        )}

        <Button asChild variant="ghost" size="sm" className="w-full justify-start">
          <Link href="/settings">
            <Settings2 className="size-4 shrink-0" aria-hidden />
            Settings
            <ChevronRight className="ms-auto size-4 shrink-0 opacity-70" aria-hidden />
          </Link>
        </Button>
      </aside>
    </div>
  );
}

function ModeTile({
  href,
  Icon,
  title,
  note,
  primary = false,
}: {
  href: string;
  Icon: typeof Cpu;
  title: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "press flex min-h-[4.5rem] flex-col justify-center gap-1 rounded-xl px-3.5 py-3 transition-colors",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "surface-raised hover:bg-accent/40",
      )}
    >
      <Icon
        className={cn("size-5 shrink-0", primary ? "opacity-90" : "text-primary")}
        aria-hidden
      />
      <span className="text-sm font-semibold leading-tight">{title}</span>
      <span
        className={cn(
          "truncate text-2xs leading-none",
          primary ? "opacity-80" : "text-muted-foreground",
        )}
        suppressHydrationWarning
      >
        {note}
      </span>
    </Link>
  );
}

/** One finished game, as a row you can reopen. */
function RecentGame({ game }: { game: GameSummary }) {
  const tone =
    game.outcome === "win"
      ? "bg-q-best"
      : game.outcome === "loss"
        ? "bg-q-blunder"
        : "bg-muted-foreground/50";

  return (
    <Link
      href={`/g/${game.id}/review`}
      className="press flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors surface-raised hover:bg-accent/40"
    >
      <span className={cn("size-2 shrink-0 rounded-full", tone)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{game.opponent}</span>
        <span className="block text-2xs text-muted-foreground">
          {game.outcome === "win" ? "Won" : game.outcome === "loss" ? "Lost" : "Drew"}
          {" · "}
          {game.moveCount} moves
        </span>
      </span>
      {game.accuracy !== null ? (
        <span className="tnum shrink-0 font-mono text-xs text-muted-foreground">
          {game.accuracy.toFixed(0)}%
        </span>
      ) : (
        <CircleDot className="size-3 shrink-0 text-muted-foreground/40" aria-hidden />
      )}
    </Link>
  );
}
