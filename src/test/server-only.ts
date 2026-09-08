/* Stub for the `server-only` package under Vitest. See `vitest.config.mts`.
 *
 * The real package exports nothing and exists purely to throw when bundled for the
 * browser. Next.js enforces that at build time, which is where it belongs; a test
 * process importing a server module directly is not the mistake it guards against. */
export {};
