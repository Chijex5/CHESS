# AI Chess Coach

Play a real engine and find out why you lost.

Stockfish 18 supplies every move and every number, in your browser. An LLM
supplies the reason — tied to the evaluation swing the engine actually measured,
and grounded in a corpus of principles you can read for yourself. Then it deals
your own mistakes back to you until you can solve them.

There is one API key, for the coach. Everything else — the engine, move legality,
evaluations, the severity classification, concept retrieval — runs locally with no
key and no external service. Playing another person needs an account and a database,
and nothing else does: every single-player route works signed out.

## Running it

```bash
pnpm install
cp .env.example .env      # add a Gemini key; see the file for where to get one
pnpm dev
```

That is enough for the whole single-player app. Multiplayer additionally wants Clerk,
Neon and Redis — `.env.example` lists each and says where it comes from — plus
`pnpm db:migrate` once the database URL is set.

The engine's WebAssembly is copied out of `node_modules` into `public/engine/` by
`scripts/copy-engine.mjs`, which `dev` and `build` both run. It is gitignored — 7 MB
of build output does not belong in a repository.

| script | |
|---|---|
| `pnpm dev` | Next.js with Turbopack |
| `pnpm build` | production build |
| `pnpm verify` | concept examples → `tsc` → `eslint` → `vitest` → `build` |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migrations (multiplayer only) |
| `pnpm concepts` | verify the worked example on every concept page |

## How a move becomes an explanation

1. You move. `chess.js` validates it; the board and the sound respond immediately.
2. Two searches at depth 14 — the position before your move and after it — run on a
   dedicated analyst worker. The opponent's reply runs on a *second* worker, so
   commentary never delays the game.
3. The win-percentage drop between them decides whether the move is worth
   discussing at all. Below your sensitivity threshold, nothing happens.
4. Position features (what was captured, what is now loose, which files opened)
   retrieve principles from a 14-entry corpus. No embeddings, no vector store —
   tag matching over a hand-written index, which is both auditable and free.
5. Those principles plus the engine's numbers go to Gemini, and the answer streams
   back as NDJSON. The model marks its own jargon in `[[double brackets]]`; matched
   terms become links into the concept pages.

Every number the coach quotes is one the engine produced. It is not asked to
evaluate anything.

## Playing another person

Single player has no server: `chess.js` at module scope decides legality, clocks and
results, which is correct against a local engine and completely wrong against another
person. So online games are adjudicated server-side — the server replays the move list,
validates with the same library, stamps the time, and the client's board becomes a
mirror it reconciles rather than a source of truth.

- **SSE down, POST up.** A move goes up as a plain `POST`; state comes down on an event
  stream. A WebSocket would buy bidirectionality nothing uses, and the socket dies at
  the function's duration ceiling anyway.
- **Postgres is the truth, Redis is the doorbell.** The pub/sub message carries a
  sequence number and nothing else, so a dropped notification costs a round trip rather
  than a move — and with no `REDIS_URL` at all the stream degrades to its heartbeat and
  games still finish.
- **No engine help during a live game.** No eval bar, no hints, no coach — absent
  rather than disabled, because a greyed-out hint button still says the app knows the
  answer. When the game ends, the client analyses the finished move list with its own
  Stockfish and the full review, accuracy figures and drills work unchanged.
- **Rating is Glicko-2**, so a new player's number moves fast and a settled one moves
  slowly, and the matchmaking queue widens its window by the deviation instead of
  guessing at ±150. Only queue games are rated; a link you sent a friend is not
  evidence about your strength.
- **Abandonment is handled by the clock.** Close the tab and your time runs out. No
  disconnect detection, no new concept.
- **A rematch is a pointer on the finished game.** Colours swap, the time control and
  the rated flag are inherited, and it is offerable for two minutes — for exactly as
  long as the event stream that would carry the answer stays open.

## Layout

```
src/lib/engine/     Stockfish workers behind a promise API; two instances —
                    a weakened opponent and a full-strength analyst
src/lib/chess/      FEN, evaluation curves, move-quality classification
src/lib/game/       the live game (mutable chess.js at module scope), plus
                    drills, stats, time controls
src/lib/coach/      prompts, retrieval, the concept corpus
src/lib/store/      zustand: game, engine, coach, hint, clock, settings,
                    online (not persisted — an online game lives on the server)
src/lib/multiplayer/  server rules, the wire protocol, the online controller
src/lib/db/         Drizzle schema and the Neon connection
src/lib/realtime/   Redis pub/sub — the doorbell, never the payload
src/components/     board, coach, eval, game, review, practise, setup
src/app/            /, /play, /play/friend, /play/online, /g/[id], /review,
                    /practise, /concepts, /profile, /settings, and the API
```

The live position is a mutable `chess.js` instance at module scope rather than
store state: a reactive copy would re-render the board on every piece of internal
bookkeeping. The stores hold the *record* — plies, annotations, analyses — and the
board is drawn from a FEN.

## Decisions worth knowing about

- **The engine is the authority on facts, the model on prose.** Evaluations,
  best moves and quality bands never come from the LLM.
- **Hints are counted.** A hinted move is marked in the notation and barred from
  the praise bands, because an accuracy figure that credits you for reading an
  arrow is worthless.
- **`Evaluation` has a `mated` variant.** UCI reports a checkmated position as
  `mate 0`, and normalising that by negation loses the sign — which scored every
  delivered checkmate as a 100% blunder until it was named instead.
- **One `gameStats()`** behind both the game-over dialog and the review page.
  Two implementations of one accuracy curve drift, and a number that changes when
  you click through looks invented.
- **The board owns the vertical axis.** One tabbed rail rather than two columns,
  one fixed-height message line rather than a stack of alerts, and a definite
  height from `lg` up so a long game scrolls its notation instead of the page.
- **The clock is off by default.** This app expects you to stop and read a
  paragraph about the move you just played. A clock running through that is a
  penalty for using it.
- **Concept examples are verified mechanically.** `pnpm concepts` checks that every
  FEN loads, that the side to move is not already in check, and that the named move
  is legal. A wrong diagram on a teaching page is worse than no diagram.
- **Sound is synthesised, not sampled.** A bandpassed noise transient over a low
  body is a piece landing on wood. No assets, no licensing, and the same cue can
  shift pitch to carry meaning.

## Not there yet

No spectating, no chat, no takebacks — the last needs a whole negotiation and the
middle needs moderation this does not have. Only one game's analysis is kept at a
time, so reviewing a second replaces the first; the history list remembers that the
earlier games happened, not what the coach said about them. Single-player games still
live nowhere but your browser's `localStorage`, and still need no account.
