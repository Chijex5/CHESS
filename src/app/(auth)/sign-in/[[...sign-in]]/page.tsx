import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { clerkAppearance } from "../../appearance";

export const metadata = { title: "Sign in · AI Chess Coach" };

export default function SignInPage() {
  return (
    <>
      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          Only needed to play other people. Everything against the engine works
          without one.
        </p>
      </div>

      <SignIn appearance={clerkAppearance} />

      <Link
        href="/play"
        className="mt-5 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        Keep playing without an account
      </Link>
    </>
  );
}
