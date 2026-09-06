import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* Only the pure server-side logic is tested here: move validation, clock
   arithmetic and the rating maths. Those are the parts where being wrong is
   invisible until a game is decided incorrectly, and they have no DOM, no
   network and no engine — so they cost nothing to test and everything to get
   wrong. The UI is verified by driving the real app instead. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
