import { ELO_MAX, ELO_MIN } from "./manager";

/* ── Who you are playing ──────────────────────────────────────────────────────
   A 1320–3190 slider asks the player a question they cannot answer. Every real
   client names its opponents instead, and chess.com's bots are the reason nobody
   there ever types a rating.

   These are not personas. A weakened Stockfish does not play like a human of the
   same rating — it plays engine moves with mistakes injected — so pretending
   otherwise would set a false expectation. Each one is named for its strength and
   described by what it will and will not let you get away with, which is the thing
   a player actually needs to choose between them.
   ─────────────────────────────────────────────────────────────────────────── */
export type Opponent = {
  id: string;
  name: string;
  elo: number;
  /** Search budget in ms. A stronger opponent takes visibly longer, which is both
   *  true and the only cue the board gives that it is thinking harder. */
  thinkMs: number;
  blurb: string;
};

export const OPPONENTS: Opponent[] = [
  {
    id: "novice",
    name: "Novice",
    elo: ELO_MIN,
    thinkMs: 400,
    blurb: "Leaves pieces loose and misses one-move tactics. If you can spot a hanging piece you can beat it.",
  },
  {
    id: "casual",
    name: "Casual",
    elo: 1600,
    thinkMs: 700,
    blurb: "Takes anything you leave undefended and little else. Wants a real mistake before it gets going.",
  },
  {
    id: "club",
    name: "Club",
    elo: 2000,
    thinkMs: 1000,
    blurb: "Sees two moves of tactics reliably. You will need a plan rather than a trick.",
  },
  {
    id: "strong",
    name: "Strong",
    elo: 2400,
    thinkMs: 1500,
    blurb: "Titled strength. Positional errors get punished ten moves after you make them.",
  },
  {
    id: "full",
    name: "Full strength",
    elo: ELO_MAX,
    thinkMs: 2000,
    blurb: "Stockfish with the brakes off. It is not going to lose, and that is the point.",
  },
];

/** The opponent a rating belongs to — the strongest one it has reached. Keeps the
 *  raw Elo dial in Advanced meaningful: any value still has a name. */
export function opponentFor(elo: number): Opponent {
  return [...OPPONENTS].reverse().find((o) => elo >= o.elo) ?? OPPONENTS[0];
}

/** True when the rating is one of the named ones rather than a hand-set value. */
export function isNamedElo(elo: number): boolean {
  return OPPONENTS.some((o) => o.elo === elo);
}
