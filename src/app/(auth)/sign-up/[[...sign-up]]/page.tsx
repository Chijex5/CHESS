import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { clerkAppearance } from "../../appearance";

export const metadata = { title: "Create an account · AI Chess Coach" };

export default function SignUpPage() {
  return (
    <>
      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Create an account</h1>
        <p className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
          Your username is what an opponent sees across the board. Everything
          against the engine works without an account at all.
        </p>
      </div>

      <SignUp appearance={clerkAppearance} />

      <Link
        href="/play"
        className="mt-5 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        Keep playing without an account
      </Link>
    </>
  );
}
