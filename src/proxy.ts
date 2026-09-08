import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/** Pages that cannot work without an identity, and so are worth redirecting.
 *
 *  Deliberately no API routes. `auth.protect()` answers a redirect, which is right
 *  for a browser following an invite link and useless to a `fetch` — so the game
 *  endpoints check the session themselves and return a 401 with a reason in the
 *  body. One mechanism per audience. */
const ONLINE_ONLY = createRouteMatcher([
  "/g(.*)",
  "/play/friend(.*)",
  "/play/online(.*)",
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
  if (!ONLINE_ONLY(request)) return;

  /* `unauthenticatedUrl` has to be given explicitly. `signInUrl` on `ClerkProvider`
     is client configuration and the proxy never sees it, so without this the
     redirect lands on Clerk's own hosted page — which works, and looks nothing like
     the themed one this app ships.

     The invite link is carried through as `redirect_url`, so someone who followed a
     friend's link and had to sign up first arrives back at the board rather than at
     the home page wondering where the game went. */
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("redirect_url", request.url);
  await auth.protect({ unauthenticatedUrl: signIn.toString() });
});

export const config = {
  matcher: [
    // Skip Next.js internals and anything with a file extension, but do run on
    // everything else so a signed-in visitor is recognised on any page.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|wasm|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
