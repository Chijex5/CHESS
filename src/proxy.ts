import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Routes that cannot work without an identity. */
const ONLINE_ONLY = createRouteMatcher([
  "/g(.*)",
  "/play/friend(.*)",
  "/play/online(.*)",
  "/api/game(.*)",
  "/api/queue(.*)",
]);

/* Named `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention and warns
   on the old name at build time. The export is still Clerk's `clerkMiddleware()` —
   only the file the framework looks for changed. */
export default clerkMiddleware(async (auth, request) => {
  /* The multiplayer surface is the only part of the app that needs an account: an
     online game has to know who is sitting where, and a rating belongs to somebody.
     `protect()` redirects a browser to sign-in and returns 401 to a fetch, which is
     the right answer for each.

     Everything else stays open. The engine game, the review, the drills and the
     concept pages all work with no account, no network and nothing leaving the
     browser — putting a wall in front of that would be a regression. */
  if (ONLINE_ONLY(request)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and anything with a file extension, but do run on
    // everything else so a signed-in visitor is recognised on any page.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|wasm|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
