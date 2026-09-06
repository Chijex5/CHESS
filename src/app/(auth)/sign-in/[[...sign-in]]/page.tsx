import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "../../appearance";
import { safeRedirect } from "../../redirect";

export const metadata = { title: "Sign in · AI Chess Coach" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in/[[...sign-in]]">) {
  /* Where they were headed before the wall. `proxy.ts` puts the original URL here, so
     someone who followed a friend's invite and had to sign in first lands on the
     board rather than the home page wondering where the game went. */
  const back = safeRedirect((await searchParams).redirect_url);
  return (
    <>
      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          Only needed to play other people. Everything against the engine works
          without one.
        </p>
      </div>

      <SignIn
        appearance={clerkAppearance}
        /* `forceRedirectUrl`, not `fallbackRedirectUrl`: the fallback only applies
           when Clerk has no destination of its own, and we want the invite link to
           win over anything it inferred. */
        forceRedirectUrl={back}
        signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(back)}`}
      />

      <Link
        /* Always the engine game, never `back`: the way out of a sign-in wall
           cannot be the page that put the wall there. */
        href="/play"
        className="mt-5 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        Keep playing the engine instead
      </Link>
    </>
  );
}
