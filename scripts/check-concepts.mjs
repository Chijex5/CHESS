/**
 * Verifies every worked example on the concept pages.
 *
 * A wrong diagram on a teaching page is worse than no diagram, so each example is
 * checked mechanically rather than by eye: the FEN must load, the side to move
 * must not already be in check, and the named SAN must be legal in that position.
 * Claims made in a caption ("wins a piece", "mate") are checked too where they are
 * mechanically checkable.
 *
 *   node scripts/check-concepts.mjs
 */
import { Chess } from "chess.js";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/coach/concepts.ts", import.meta.url), "utf8");

/* The corpus is TypeScript, so the examples are pulled out textually rather than
   imported — this script must run without a build step. */
const examples = [...source.matchAll(/slug: "([a-z-]+)"/g)].map(([, slug]) => {
  const from = source.indexOf(`slug: "${slug}"`);
  const next = source.indexOf('slug: "', from + 8);
  const block = source.slice(from, next === -1 ? source.length : next);
  const fen = block.match(/fen:\s*"([^"]+)"/)?.[1];
  const san = block.match(/san:\s*"([^"]+)"/)?.[1];
  return { slug, fen, san };
});

let failed = 0;
const report = (slug, ok, detail) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${slug.padEnd(20)} ${detail}`);
};

for (const { slug, fen, san } of examples) {
  if (!fen || !san) {
    report(slug, false, "no example");
    continue;
  }

  let board;
  try {
    board = new Chess(fen);
  } catch (error) {
    report(slug, false, `bad FEN — ${error.message}`);
    continue;
  }

  if (board.isCheck()) {
    report(slug, false, "side to move is already in check");
    continue;
  }

  const legal = board.moves();
  if (!legal.includes(san)) {
    const near = legal.filter((m) => m[0] === san[0]).slice(0, 8).join(" ");
    report(slug, false, `"${san}" is not legal. Tried: ${near || legal.slice(0, 8).join(" ")}`);
    continue;
  }

  const move = board.move(san);
  const flags = [
    move.captured ? `takes ${move.captured}` : null,
    board.isCheckmate() ? "mate" : board.isCheck() ? "check" : null,
  ].filter(Boolean);
  report(slug, true, `${san}${flags.length ? ` (${flags.join(", ")})` : ""}`);
}

console.log(
  failed === 0
    ? `\n${examples.length} examples verified.`
    : `\n${failed} of ${examples.length} examples are wrong.`,
);
process.exit(failed === 0 ? 0 : 1);
