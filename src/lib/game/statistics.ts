import type { GameEnding, MoveQuality } from "@/lib/chess/types";
import { EMPTY_TALLY, type GameSummary, type QualityTally } from "@/lib/archive/types";

/* ── What the games add up to ─────────────────────────────────────────────────
   One pure function over the archive, for the same reason there is one
   `gameStats()`: a record shown in the header and a record shown on the profile
   page were already two implementations of the same arithmetic, and they had already
   started to differ in what counts as a game. This is the one that counts.

   Pure and synchronous, so it runs identically over a signed-in player's rows from
   Postgres and a signed-out one's from IndexedDB, and so every claim it makes can be
   pinned by a test rather than by playing forty games.
   ─────────────────────────────────────────────────────────────────────────── */

export type Record3 = { wins: number; losses: number; draws: number; games: number };

/** Speed bands rather than the five named controls, because "3 min" and "5 min" are
 *  the same kind of chess and splitting them makes both samples too small to mean
 *  anything. Bounds are the conventional ones. */
export type Speed = "untimed" | "bullet" | "blitz" | "rapid" | "classical";

export function speedOf(initialMs: number): Speed {
  if (initialMs === 0) return "untimed";
  if (initialMs < 180_000) return "bullet";
  if (initialMs < 600_000) return "blitz";
  if (initialMs < 1_800_000) return "rapid";
  return "classical";
}

export const SPEED_LABEL: Record<Speed, string> = {
  untimed: "No clock",
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical",
};

export type Weakness = {
  slug: string;
  /** How many of your mistakes cited it. */
  count: number;
  /** How many separate games it turned up in — the number that says "habit" rather
   *  than "one bad afternoon". */
  games: number;
};

export type AccuracyPoint = { playedAt: number; accuracy: number };

export type Opening = {
  /** The first three plies, as played. */
  moves: string;
  record: Record3;
};

export type Statistics = {
  record: Record3;
  byColour: { white: Record3; black: Record3 };
  bySource: { engine: Record3; online: Record3 };
  bySpeed: { speed: Speed; record: Record3 }[];
  /** Games where the coach has actually run. Everything below is over these. */
  analysed: number;
  accuracy: { mean: number | null; points: AccuracyPoint[] };
  /** Per-game averages, over analysed games. */
  perGame: { blunders: number; mistakes: number; inaccuracies: number } | null;
  /** Your own moves, banded, across every analysed game. */
  qualities: QualityTally;
  weaknesses: Weakness[];
  /** How your wins arrive, and how your losses do. Two different stories. */
  endings: { wins: Partial<Record<GameEnding, number>>; losses: Partial<Record<GameEnding, number>> };
  openings: Opening[];
  /** Positive for a winning streak, negative for a losing one, 0 after a draw or
   *  with no games. Read from the most recent game backwards. */
  streak: number;
};

const emptyRecord = (): Record3 => ({ wins: 0, losses: 0, draws: 0, games: 0 });

function count(into: Record3, summary: GameSummary): void {
  into.games += 1;
  if (summary.outcome === "win") into.wins += 1;
  else if (summary.outcome === "loss") into.losses += 1;
  else into.draws += 1;
}

export function winRate(record: Record3): number | null {
  /* Draws stay in the denominator: a drawn game is a game played, and dropping them
     would let a cautious player's rate climb by never losing. */
  return record.games === 0 ? null : record.wins / record.games;
}

/**
 * Everything the profile page reports, from the archive alone.
 *
 * `summaries` may be in any order; the streak and the accuracy trend both depend on
 * time, so it is sorted here rather than trusted. Unanalysed games count towards the
 * record and towards nothing else — an accuracy average that treated "not measured"
 * as a value would be reporting a number nobody played.
 */
export function statistics(summaries: GameSummary[]): Statistics {
  const games = [...summaries].sort((a, b) => a.playedAt - b.playedAt);

  const record = emptyRecord();
  const byColour = { white: emptyRecord(), black: emptyRecord() };
  const bySource = { engine: emptyRecord(), online: emptyRecord() };
  const speeds = new Map<Speed, Record3>();
  const openings = new Map<string, Record3>();
  const endings: Statistics["endings"] = { wins: {}, losses: {} };

  const qualities: QualityTally = { ...EMPTY_TALLY };
  const conceptCounts = new Map<string, { count: number; games: number }>();
  const points: AccuracyPoint[] = [];
  let accuracySum = 0;
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;
  let analysed = 0;

  for (const game of games) {
    count(record, game);
    count(byColour[game.side], game);
    count(bySource[game.source], game);

    const speed = speedOf(game.initialMs);
    const speedRecord = speeds.get(speed) ?? emptyRecord();
    count(speedRecord, game);
    speeds.set(speed, speedRecord);

    if (game.firstMoves) {
      const opening = openings.get(game.firstMoves) ?? emptyRecord();
      count(opening, game);
      openings.set(game.firstMoves, opening);
    }

    if (game.ending && game.outcome !== "draw") {
      const bucket = game.outcome === "win" ? endings.wins : endings.losses;
      bucket[game.ending] = (bucket[game.ending] ?? 0) + 1;
    }

    /* One field decides whether a game has been analysed, and it is the same field the
       archive uses. A game with a quality tally but no accuracy would be a game too
       short to measure, and averaging it in as zero would libel the player. */
    if (game.accuracy === null) continue;
    analysed += 1;
    accuracySum += game.accuracy;
    points.push({ playedAt: game.playedAt, accuracy: game.accuracy });

    if (game.qualities) {
      for (const band of Object.keys(qualities) as MoveQuality[]) {
        qualities[band] += game.qualities[band];
      }
      blunders += game.qualities.blunder;
      mistakes += game.qualities.mistake;
      inaccuracies += game.qualities.inaccuracy;
    }

    for (const [slug, times] of Object.entries(game.concepts ?? {})) {
      const seen = conceptCounts.get(slug) ?? { count: 0, games: 0 };
      seen.count += times;
      seen.games += 1;
      conceptCounts.set(slug, seen);
    }
  }

  return {
    record,
    byColour,
    bySource,
    /* Ordered by the bands themselves rather than by how many you have played, so the
       row for blitz does not move when you play a rapid game. */
    bySpeed: (["bullet", "blitz", "rapid", "classical", "untimed"] as Speed[])
      .filter((speed) => speeds.has(speed))
      .map((speed) => ({ speed, record: speeds.get(speed)! })),
    analysed,
    accuracy: { mean: analysed === 0 ? null : accuracySum / analysed, points },
    perGame:
      analysed === 0
        ? null
        : {
            blunders: blunders / analysed,
            mistakes: mistakes / analysed,
            inaccuracies: inaccuracies / analysed,
          },
    qualities,
    weaknesses: [...conceptCounts.entries()]
      .map(([slug, seen]) => ({ slug, ...seen }))
      /* By how many games it appeared in first, and only then by raw count. Three
         games with one hanging piece each is a habit; one game with three is a bad
         afternoon, and ranking by count alone cannot tell them apart. */
      .sort((a, b) => b.games - a.games || b.count - a.count || a.slug.localeCompare(b.slug))
      .slice(0, 8),
    endings,
    openings: [...openings.entries()]
      .map(([moves, record]) => ({ moves, record }))
      .sort((a, b) => b.record.games - a.record.games || a.moves.localeCompare(b.moves))
      .slice(0, 5),
    streak: streakOf(games),
  };
}

/** Signed run length of the most recent identical result. */
function streakOf(chronological: GameSummary[]): number {
  const last = chronological.at(-1);
  if (!last || last.outcome === "draw") return 0;
  let run = 0;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    if (chronological[i].outcome !== last.outcome) break;
    run += 1;
  }
  return last.outcome === "win" ? run : -run;
}

/** A rolling mean, for a trend line that is readable rather than jagged. Window sizes
 *  below the sample count are clamped, so a player with four games still gets a line. */
export function smooth(points: AccuracyPoint[], window = 5): AccuracyPoint[] {
  if (points.length === 0) return [];
  const size = Math.max(1, Math.min(window, points.length));
  return points.map((point, index) => {
    const from = Math.max(0, index - size + 1);
    const slice = points.slice(from, index + 1);
    const mean = slice.reduce((sum, p) => sum + p.accuracy, 0) / slice.length;
    return { playedAt: point.playedAt, accuracy: mean };
  });
}
