/* ── The wire ─────────────────────────────────────────────────────────────────
   One module imported by both the routes and the browser, so a change to an event
   shape is a type error on both sides rather than a bug that only shows up between
   two people.

   The events carry a sequence number and nothing that cannot be re-derived. That
   is deliberate: the SSE stream is a doorbell, not the source of truth. A client
   that misses an event notices at the next one — its cursor is behind — and
   catches up from the database. Losing a message costs a round trip, not a move.
   ─────────────────────────────────────────────────────────────────────────── */

export type Seat = "white" | "black";
export type GameWinner = "white" | "black" | "draw";
export type GameEnding =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "stalemate"
  | "insufficient-material"
  | "threefold"
  | "fifty-move"
  | "agreement"
  | "abandoned";

export function opposite(seat: Seat): Seat {
  return seat === "white" ? "black" : "white";
}

export type PublicPlayer = {
  username: string;
  rating: number;
  /** Provisional while the deviation is still wide — shown as "1500?" rather than
   *  implying a precision the number does not have. */
  provisional: boolean;
};

/** Everything needed to draw the board and the clocks from cold. */
export type GameSnapshot = {
  id: string;
  status: "pending" | "active" | "finished" | "abandoned";
  white: PublicPlayer | null;
  black: PublicPlayer | null;
  /** Which seat *you* are, or null when watching a game you are not in. */
  seat: Seat | null;
  sans: string[];
  /** Ply of the last move; the cursor a client resumes from. */
  seq: number;
  initialMs: number;
  incrementMs: number;
  msLeftWhite: number;
  msLeftBlack: number;
  /** Server time the side on the move started thinking. */
  turnStartedAt: number;
  /** Server time when the snapshot was taken, so a client can correct for the
   *  round trip instead of assuming its own clock agrees. */
  serverNow: number;
  winner: GameWinner | null;
  ending: GameEnding | null;
  offer: { kind: "draw" | "rematch"; by: Seat } | null;
  rated: boolean;
};

export type ServerEvent =
  /** Sent once on connect and after any resume, so a fresh stream needs no
   *  separate fetch. */
  | { type: "snapshot"; snapshot: GameSnapshot }
  | {
      type: "move";
      seq: number;
      san: string;
      uci: string;
      msLeftWhite: number;
      msLeftBlack: number;
      playedAt: number;
    }
  | { type: "joined"; seat: Seat; player: PublicPlayer; startedAt: number }
  | { type: "offer"; kind: "draw" | "rematch"; by: Seat }
  | { type: "offer-declined"; kind: "draw" | "rematch" }
  | {
      type: "over";
      winner: GameWinner;
      ending: GameEnding;
      /** Present only for rated games. */
      ratings?: Record<Seat, { before: number; after: number }>;
    }
  /** Keeps proxies from closing an idle stream, and lets the client notice a dead
   *  connection without waiting for a move that may be minutes away. */
  | { type: "ping"; now: number };

export type MoveRequest = {
  from: string;
  to: string;
  promotion?: string;
  /** The ply the client believes it is playing. */
  seq: number;
};
