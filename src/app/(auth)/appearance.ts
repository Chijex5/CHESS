import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

/* Read off the component rather than imported from a package path. `@clerk/types`
   is deprecated in Core 3 and its replacement lives in a transitive dependency
   pnpm does not hoist, so taking the type from the prop that consumes it is both
   correct today and immune to the next reshuffle. */
type Appearance = NonNullable<ComponentProps<typeof SignIn>["appearance"]>;

/* Clerk renders into the page rather than an iframe, so the app's own custom
   properties resolve inside it. That means one mapping themes the sign-in card
   from the same tokens as everything else and follows the light/dark switch for
   free, instead of a second palette kept in sync by hand.

   The names below are Core 3's. It renamed the lot — `colorText` became
   `colorForeground`, `colorInputBackground` became `colorInput` — and silently
   ignoring an unknown key is exactly the kind of thing that ships looking wrong. */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorBorder: "var(--border)",
    colorInput: "var(--background)",
    colorInputForeground: "var(--foreground)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-geist-sans)",
    fontFamilyButtons: "var(--font-geist-sans)",
  },
  elements: {
    /* The page already has a heading, and Clerk's own reads "Sign in to
       <application name>" — which is the Clerk resource name, not the product's.
       `hidden!` rather than `hidden`: Clerk injects its stylesheet after Tailwind's,
       so at equal specificity its `display` wins and the plain utility does nothing. */
    headerTitle: "hidden!",
    headerSubtitle: "hidden!",
    cardBox: "shadow-lg",
  },
};
