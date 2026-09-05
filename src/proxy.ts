import { clerkMiddleware } from "@clerk/nextjs/server";

/* Nothing is protected, deliberately.
   Single player is the whole product today: it runs the engine locally, needs no
   network after the first load, and the landing page promises that nothing about
   your game leaves the browser until the coach is asked. Putting a sign-in wall in
   front of that would be a regression dressed as a feature.

   So this only *reads* the session and makes it available. Routes that genuinely
   need an account — the multiplayer rooms and the matchmaking queue — will call
   `auth.protect()` themselves when they exist. */
/* Named `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention and warns
   on the old name at build time. The export is still Clerk's `clerkMiddleware()` —
   only the file the framework looks for changed. */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and anything with a file extension, but do run on
    // everything else so a signed-in visitor is recognised on any page.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|wasm|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
