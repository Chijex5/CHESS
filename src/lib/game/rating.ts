/* ── Glicko-2 ─────────────────────────────────────────────────────────────────
   Elo would be simpler, and wrong for what the matchmaking queue needs. Elo gives
   a number with no idea how much to trust it, so a brand-new player and a settled
   one move at the same rate and the queue has no basis for choosing a pairing
   window. Glicko-2 carries a deviation alongside the rating: a new account swings
   hundreds of points in a few games and then steadies, and the queue can widen its
   search by that deviation instead of a guessed constant.

   Implemented from Glickman's paper (glicko.net/glicko/glicko2.pdf) and verified
   against its worked example in `rating.test.ts` — the numbers there are his, not
   ours, which is the only way to know this file is right.

   One game per rating period rather than batching. Glickman recommends periods
   containing several games, but a chess app has to show the new number the moment
   the game ends; the cost is slightly noisier ratings, which is the right trade
   when the alternative is a figure that appears hours later.
   ─────────────────────────────────────────────────────────────────────────── */

/** Conversion between the display scale and Glicko-2's internal one. */
const SCALE = 173.7178;
const BASE = 1500;

/** How much volatility is allowed to change between periods. Smaller is steadier;
 *  Glickman suggests 0.3–1.2, and 0.5 is the usual choice for chess. */
const TAU = 0.5;

/** Convergence tolerance for the volatility iteration. */
const EPSILON = 0.000_001;

export type Rating = {
  rating: number;
  /** Rating deviation: the uncertainty, in display points. */
  rd: number;
  volatility: number;
};

export const UNRATED: Rating = { rating: BASE, rd: 350, volatility: 0.06 };

/** Above this deviation the rating has not settled and should be shown with a
 *  question mark rather than as a fact. */
export const PROVISIONAL_RD = 110;

export function isProvisional(rd: number): boolean {
  return rd > PROVISIONAL_RD;
}

/** Score from one player's point of view. */
export type Score = 0 | 0.5 | 1;

type Opponent = { rating: number; rd: number; score: Score };

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, muOther: number, phiOther: number) =>
  1 / (1 + Math.exp(-g(phiOther) * (mu - muOther)));

/**
 * The new volatility, found by root-finding rather than in closed form — the
 * equation has no algebraic solution, which is the one genuinely fiddly part of
 * Glicko-2.
 *
 * Illinois variant of regula falsi, as the paper specifies. It converges in a
 * handful of iterations; the loop bound exists so a pathological input cannot
 * hang a request rather than because it is expected to be reached.
 */
function newVolatility(phi: number, sigma: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const denominator = phi * phi + v + ex;
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * denominator * denominator) -
      (x - a) / (TAU * TAU)
    );
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    B = a - k * TAU;
    while (f(B) < 0 && k < 100) {
      k += 1;
      B = a - k * TAU;
    }
  }

  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > EPSILON; i += 1) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      // Illinois: halve the retained endpoint's value to avoid stalling.
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * A player's new rating after a rating period.
 *
 * `opponents` is empty when the player sat out: the rating stays put and only the
 * deviation grows, which is Glicko-2 forgetting how sure it was.
 */
export function updateRating(player: Rating, opponents: Opponent[]): Rating {
  const mu = (player.rating - BASE) / SCALE;
  const phi = player.rd / SCALE;

  if (opponents.length === 0) {
    return {
      rating: player.rating,
      rd: Math.min(350, SCALE * Math.sqrt(phi * phi + player.volatility ** 2)),
      volatility: player.volatility,
    };
  }

  let vInverse = 0;
  let deltaSum = 0;
  for (const opponent of opponents) {
    const muJ = (opponent.rating - BASE) / SCALE;
    const phiJ = opponent.rd / SCALE;
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);
    vInverse += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (opponent.score - e);
  }
  const v = 1 / vInverse;
  const delta = v * deltaSum;

  const sigma = newVolatility(phi, player.volatility, v, delta);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;

  return {
    rating: SCALE * muNew + BASE,
    // Capped at the initial deviation: beyond it the number means nothing anyway.
    rd: Math.min(350, SCALE * phiNew),
    volatility: sigma,
  };
}

/** Both players' new ratings after one game. Applied simultaneously, from the
 *  ratings each held *before* it — updating one and then feeding the new value to
 *  the other would hand a small advantage to whoever was calculated second. */
export function applyGame(
  white: Rating,
  black: Rating,
  winner: "white" | "black" | "draw",
): { white: Rating; black: Rating } {
  const whiteScore: Score = winner === "draw" ? 0.5 : winner === "white" ? 1 : 0;
  const blackScore: Score = (1 - whiteScore) as Score;
  return {
    white: updateRating(white, [{ ...black, score: whiteScore }]),
    black: updateRating(black, [{ ...white, score: blackScore }]),
  };
}

/** Rounded for display. Ratings are stored as floats and shown as integers; the
 *  fraction matters over a season and never on screen. */
export function displayRating(rating: number): number {
  return Math.round(rating);
}
