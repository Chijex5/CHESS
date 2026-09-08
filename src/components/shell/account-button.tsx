"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Show, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setArchiveSignedIn } from "@/lib/archive";
import { importLocalGames } from "@/lib/archive/import-local";

/* An account is optional, and the header has to say so: signed out you get a way
   in rather than a wall.

   `<Show>` replaced `<SignedIn>`/`<SignedOut>` in Clerk Core 3. It renders `null`
   while the session resolves, so the slot keeps a minimum size — otherwise the
   sound and theme buttons beside it shuffle sideways once auth lands. */
export function AccountButton() {
  return (
    <>
      <ArchiveIdentity />
      <span className="flex min-h-8 min-w-8 shrink-0 items-center justify-end gap-1.5">
        <Show
          when="signed-in"
          fallback={
            <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
              <Link href="/sign-in">
                <LogIn className="size-3.5" aria-hidden />
                <span className="max-sm:sr-only">Sign in</span>
              </Link>
            </Button>
          }
        >
          <Handle />
          {/* Clerk's default avatar is 28px and sits a pixel proud of the 32px icon
              buttons it stands next to. */}
          <UserButton appearance={{ elements: { userButtonAvatarBox: "size-7" } }} />
        </Show>
      </span>
    </>
  );
}

/* Tells the archive which backend to use. It lives here because the header is on every
   page, and it renders nothing.

   The archive needs one fact React knows and it does not: whether there is a session. A
   game can end in `controller.ts`, which is not a component and cannot read a hook, so
   the fact is pushed to a module rather than pulled from one. Without this the archive
   falls back to asking `/api/me`, which is correct but a round trip slower. */
function ArchiveIdentity() {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    setArchiveSignedIn(Boolean(isSignedIn));
    /* Games played on this device before there was an account follow the player into
       it, once. Fired and not awaited: it is a background upload, and nothing on the
       page depends on it having finished. */
    if (isSignedIn) void importLocalGames();
  }, [isLoaded, isSignedIn]);
  return null;
}

/* The handle and the rating, beside the avatar. Usernames are required on this
   instance, so the name is always there — but an OAuth sign-up sets it a step later
   than the session, and a header rendering "undefined" for that half-second is worse
   than one that waits.

   The rating is fetched rather than read from Clerk: it lives in Postgres, changes
   when a rated game ends, and putting it in session claims would mean a stale number
   until the next token refresh. */
function Handle() {
  const { user } = useUser();
  const [rating, setRating] = useState<{ value: number; provisional: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    void fetch("/api/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (live && body?.rating) setRating(body.rating);
      })
      .catch(() => {
        // A missing rating is a missing badge, not an error worth showing.
      });
    return () => {
      live = false;
    };
  }, [user]);

  if (!user?.username) return null;
  return (
    <span className="hidden items-baseline gap-1.5 sm:flex">
      <Link
        href="/profile"
        className="max-w-32 truncate text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {user.username}
      </Link>
      {rating && (
        <span
          className="tnum font-mono text-2xs text-muted-foreground/70"
          title={
            rating.provisional
              ? "Provisional — the rating is still settling"
              : "Rating"
          }
        >
          {rating.value}
          {rating.provisional && "?"}
        </span>
      )}
    </span>
  );
}
