"use client";

import Link from "next/link";
import { Show, UserButton, useUser } from "@clerk/nextjs";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/* An account is optional, and the header has to say so: signed out you get a way
   in rather than a wall.

   `<Show>` replaced `<SignedIn>`/`<SignedOut>` in Clerk Core 3. It renders `null`
   while the session resolves, so the slot keeps a minimum size — otherwise the
   sound and theme buttons beside it shuffle sideways once auth lands. */
export function AccountButton() {
  return (
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
  );
}

/* The handle, beside the avatar. Usernames are required on this instance, so it is
   always there — but an OAuth sign-up sets it a step later than the session, and a
   header that renders "undefined" for that half-second is worse than one that waits. */
function Handle() {
  const { user } = useUser();
  if (!user?.username) return null;
  return (
    <span className="hidden max-w-32 truncate text-xs font-medium text-muted-foreground sm:block">
      {user.username}
    </span>
  );
}
