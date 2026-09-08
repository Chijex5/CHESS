"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Flame, ListOrdered, Sparkles, Swords, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LineChart } from "@/components/stats/line-chart";
import { BarList, type BarRow } from "@/components/stats/bar-list";
import { RecordBar, StatTile } from "@/components/stats/record-bar";
import { archive } from "@/lib/archive";
import type { GameSummary } from "@/lib/archive/types";
import {
  SPEED_LABEL,
  smooth,
  statistics,
  winRate,
  type Statistics,
} from "@/lib/game/statistics";
import { CONCEPTS } from "@/lib/coach/concepts";
import { formatClock } from "@/lib/game/time-controls";

/* ── The profile ──────────────────────────────────────────────────────────────
   This page used to show four counts and two lists, because four counts and two lists
   were all that existed: every game overwrote the last one's analysis, so there was no
   corpus to say anything about. The archive is that corpus, and this is the payoff.

   Every figure below comes from `statistics()` over the same summaries, for the same
   reason the review page and the game-over dialog share `gameStats()`. And it runs
   client-side rather than in a route so that a signed-out player reading IndexedDB sees
   the identical page to a signed-in one reading Postgres.
   ─────────────────────────────────────────────────────────────────────────── */

type Profile = {
  username: string;
  rating: { value: number; provisional: boolean };
  curve: { at: number; rating: number }[];
};

const CONCEPT_NAME = new Map(CONCEPTS.map((concept) => [concept.slug, concept.name]));

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

export function ProfileView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [summaries, setSummaries] = useState<GameSummary[] | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/profile", { cache: "no-store" }).then(async (response) => {
      if (!live) return;
      if (response.status === 401) setSignedOut(true);
      else if (response.ok) setProfile(await response.json());
    });
    /* The archive answers for whichever backend applies, so this same call is a query
       against Postgres or against this device depending on the session. */
    void (async () => {
      const store = await archive();
      const rows = await store.summaries();
      if (live) setSummaries(rows);
    })();
    return () => {
      live = false;
    };
  }, []);

  const stats = useMemo(() => (summaries ? statistics(summaries) : null), [summaries]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <header className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
            <Trophy className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {profile?.username ?? (signedOut ? "Your games" : "Your profile")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {signedOut
                ? "Signed out — these are the games played in this browser."
                : "Every game you have played, and what they add up to."}
            </p>
          </div>
          {profile && (
            <span className="ms-auto text-end">
              <span className="block text-2xs text-muted-foreground">Rating</span>
              <span className="tnum font-mono text-2xl font-semibold">
                {profile.rating.value}
                {profile.rating.provisional && "?"}
              </span>
            </span>
          )}
        </div>
        {signedOut && (
          <Button asChild size="sm" className="mt-4">
            <Link href="/sign-in">Sign in to keep them everywhere</Link>
          </Button>
        )}
      </header>

      {stats === null ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Reading your games…
        </p>
      ) : stats.record.games === 0 ? (
        <Empty />
      ) : (
        <Body stats={stats} curve={profile?.curve ?? []} summaries={summaries ?? []} />
      )}
    </main>
  );
}

function Body({
  stats,
  curve,
  summaries,
}: {
  stats: Statistics;
  curve: { at: number; rating: number }[];
  summaries: GameSummary[];
}) {
  const trend = useMemo(() => smooth(stats.accuracy.points), [stats.accuracy.points]);

  const weaknesses: BarRow[] = stats.weaknesses.map((weakness) => ({
    key: weakness.slug,
    label: (
      <Link href={`/concepts/${weakness.slug}`} className="hover:underline">
        {CONCEPT_NAME.get(weakness.slug) ?? weakness.slug}
      </Link>
    ),
    value: weakness.games,
    display: `${weakness.games} game${weakness.games === 1 ? "" : "s"}`,
    note:
      weakness.count > weakness.games
        ? `${weakness.count} times in total`
        : undefined,
  }));

  const openings: BarRow[] = stats.openings.map((opening) => ({
    key: opening.moves,
    label: <span className="font-mono text-xs">{opening.moves}</span>,
    value: opening.record.games,
    display: `${opening.record.games}`,
    note: `${pct(winRate(opening.record))} won · ${opening.record.wins}W ${opening.record.draws}D ${opening.record.losses}L`,
  }));

  return (
    <>
      <section className="mt-5 grid gap-3 sm:grid-cols-4" aria-label="Overall">
        <StatTile
          label="Games played"
          value={String(stats.record.games)}
          note={`${stats.analysed} analysed`}
        />
        <StatTile label="Win rate" value={pct(winRate(stats.record))} note="Draws included" />
        <StatTile
          label="Accuracy"
          value={stats.accuracy.mean === null ? "—" : `${stats.accuracy.mean.toFixed(1)}%`}
          note={stats.analysed === 0 ? "Analyse a game" : `Over ${stats.analysed} games`}
        />
        <StatTile
          label="Current streak"
          value={
            stats.streak === 0
              ? "—"
              : `${Math.abs(stats.streak)} ${stats.streak > 0 ? "won" : "lost"}`
          }
          note={stats.streak === 0 ? "Last game was a draw" : "In a row"}
        />
      </section>

      {curve.length > 1 && (
        <Panel
          title="Rating"
          icon={BarChart3}
          note="After every rated game against a stranger."
        >
          <LineChart
            points={curve.map((point) => ({ x: point.at, y: point.rating }))}
            label="Rating"
          />
        </Panel>
      )}

      {trend.length > 1 && (
        <Panel
          title="Accuracy"
          icon={Target}
          note="A five-game rolling average, so one bad game does not read as a slump."
        >
          <LineChart
            points={trend.map((point) => ({ x: point.playedAt, y: point.accuracy }))}
            label="Accuracy"
            format={(value) => `${Math.round(value)}%`}
            // Against 100, not against your own best game.
            includeY={[100]}
          />
        </Panel>
      )}

      <Panel title="Record" icon={Swords}>
        <div className="grid gap-4 sm:grid-cols-2">
          <RecordBar label="As White" record={stats.byColour.white} />
          <RecordBar label="As Black" record={stats.byColour.black} />
          <RecordBar label="Against the engine" record={stats.bySource.engine} />
          <RecordBar label="Against people" record={stats.bySource.online} />
          {stats.bySpeed.map(({ speed, record }) => (
            <RecordBar key={speed} label={SPEED_LABEL[speed]} record={record} />
          ))}
        </div>
      </Panel>

      {stats.perGame && (
        <Panel
          title="Per game"
          icon={Flame}
          note={`Your own moves, across ${stats.analysed} analysed game${stats.analysed === 1 ? "" : "s"}.`}
        >
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Blunders" value={stats.perGame.blunders.toFixed(1)} />
            <StatTile label="Mistakes" value={stats.perGame.mistakes.toFixed(1)} />
            <StatTile label="Inaccuracies" value={stats.perGame.inaccuracies.toFixed(1)} />
          </div>
        </Panel>
      )}

      {weaknesses.length > 0 && (
        <Panel
          title="What keeps costing you"
          icon={Sparkles}
          note="Ranked by how many separate games the coach cited it in — a habit rather than one bad afternoon."
        >
          <BarList rows={weaknesses} />
        </Panel>
      )}

      {openings.length > 0 && (
        <Panel title="Your openings" icon={ListOrdered} note="By the first three moves played.">
          <BarList rows={openings} />
        </Panel>
      )}

      <Endings endings={stats.endings} />
      <History summaries={summaries} />
    </>
  );
}

function Endings({ endings }: { endings: Statistics["endings"] }) {
  const list = (bucket: Partial<Record<string, number>>) =>
    Object.entries(bucket).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const wins = list(endings.wins);
  const losses = list(endings.losses);
  if (wins.length === 0 && losses.length === 0) return null;

  return (
    <Panel title="How they end" icon={Trophy} note="Two different stories.">
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          { heading: "Your wins", rows: wins },
          { heading: "Your losses", rows: losses },
        ].map(({ heading, rows }) => (
          <div key={heading}>
            <h3 className="text-xs font-medium text-muted-foreground">{heading}</h3>
            {rows.length === 0 ? (
              <p className="mt-1.5 font-serif text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {rows.map(([ending, count]) => (
                  <li key={ending} className="flex justify-between gap-3 text-sm">
                    <span className="capitalize">{ending.replace(/-/g, " ")}</span>
                    <span className="tnum font-mono text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* The history list is also the way back into a game: every analysed row links to its
   stored review, which is the whole point of keeping them. */
function History({ summaries }: { summaries: GameSummary[] }) {
  const [limit, setLimit] = useState(15);
  if (summaries.length === 0) return null;

  return (
    <Panel title="Games" icon={ListOrdered}>
      <ul className="divide-y">
        {summaries.slice(0, limit).map((game) => (
          <li key={game.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span
              className={
                game.outcome === "win"
                  ? "w-10 shrink-0 text-xs font-semibold text-q-best-ink"
                  : game.outcome === "loss"
                    ? "w-10 shrink-0 text-xs font-semibold text-q-blunder-ink"
                    : "w-10 shrink-0 text-xs font-semibold text-muted-foreground"
              }
            >
              {game.outcome === "win" ? "Won" : game.outcome === "loss" ? "Lost" : "Draw"}
            </span>
            <span className="min-w-0 flex-1 truncate">{game.opponent}</span>
            <span className="tnum hidden shrink-0 font-mono text-2xs text-muted-foreground sm:inline">
              {game.initialMs === 0 ? "no clock" : formatClock(game.initialMs)}
              {" · "}
              {game.moveCount} moves
            </span>
            <span className="tnum w-12 shrink-0 text-end font-mono text-2xs text-muted-foreground">
              {game.accuracy === null ? "—" : `${Math.round(game.accuracy)}%`}
            </span>
            <Button asChild size="sm" variant="ghost" className="h-7 shrink-0 text-xs">
              <Link
                href={
                  game.accuracy === null && game.source === "online"
                    ? `/g/${game.id}/analyse`
                    : `/g/${game.id}/review`
                }
              >
                {game.accuracy === null ? "Analyse" : "Review"}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      {summaries.length > limit && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-xs"
          onClick={() => setLimit((current) => current + 25)}
        >
          Show more ({summaries.length - limit} older)
        </Button>
      )}
    </Panel>
  );
}

function Empty() {
  return (
    <div className="mt-8 rounded-xl border bg-card p-8 text-center">
      <Swords className="mx-auto size-7 text-muted-foreground/40" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold">No games yet</h2>
      <p className="mx-auto mt-2 max-w-sm font-serif text-base leading-relaxed text-muted-foreground">
        Play one and this page fills in: your record by colour and speed, how your
        accuracy moves, and which ideas keep costing you games.
      </p>
      <Button asChild className="mt-5">
        <Link href="/play">Play a game</Link>
      </Button>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  note,
  children,
}: {
  title: string;
  icon: typeof Trophy;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {note && (
        <p className="mt-1 font-serif text-sm leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}
