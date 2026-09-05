/* Stockfish ships its browser builds inside node_modules; the loader fetches its
   sibling .wasm by relative path, so both files must sit together and be served
   same-origin. lite-single needs no COOP/COEP headers — a multi-threaded build
   would require cross-origin isolation across the whole document. */
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BUILD = "stockfish-18-lite-single";
const from = join("node_modules", "stockfish", "bin");
const to = join("public", "engine");

if (!existsSync(join(from, `${BUILD}.js`))) {
  console.error(`Missing ${BUILD}.js in ${from}. Reinstall the stockfish package.`);
  process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const ext of ["js", "wasm"]) {
  const src = join(from, `${BUILD}.${ext}`);
  const dest = join(to, `${BUILD}.${ext}`);
  copyFileSync(src, dest);
  console.log(`${dest}  ${(statSync(dest).size / 1e6).toFixed(1)} MB`);
}
