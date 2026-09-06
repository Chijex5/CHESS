import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "../../appearance";
import { safeRedirect } from "../../redirect";

export const metadata = { title: "Create an account · AI Chess Coach" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up/[[...sign-up]]">) {
  const back = safeRedirect((await searchParams).redirect_url);
  return (
    <>
      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          Your username is what an opponent sees across the board. Everything
          against the engine works without an account at all.
        </p>
      </div>

      <SignUp
        appearance={clerkAppearance}
        forceRedirectUrl={back}
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(back)}`}
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
