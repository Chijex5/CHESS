"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListOrdered, Dumbbell, Swords, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Where you go, on a phone ─────────────────────────────────────────────────
   In normal flow at the bottom of the shell's flex column rather than `fixed`, so
   it takes its own space and can never cover the last row of a page. `sticky` keeps
   it on screen while the content above scrolls under it.

   The active tab is a lit chip, not a colour change on a label: at 11px a colour
   swap is not a signal anybody registers in passing, which is the only way a tab bar
   is ever read.
   ─────────────────────────────────────────────────────────────────────────── */
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/review", label: "Review", Icon: ListOrdered },
  { href: "/practise", label: "Practise", Icon: Dumbbell },
  { href: "/profile", label: "Profile", Icon: UserRound },
] as const;

export function TabBar() {
  const pathname = usePathname();
  /* Home matches only itself — every other route starts with "/". A live board lives
     under `/g`, which belongs to Play: it is where you are when you are playing. */
  const isCurrent = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href ||
        pathname.startsWith(`${href}/`) ||
        (href === "/play" && pathname.startsWith("/g/"));

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-40 flex shrink-0 gap-1 border-t bg-background/95 px-2 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-sm sm:hidden"
    >
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrent(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              /* 44px of height is the platform minimum for a thumb, and this is the
                 control most often hit without looking. */
              "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
              current
                ? "bg-primary/12 font-semibold text-primary"
                : "text-muted-foreground active:bg-accent/60",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className="truncate text-2xs leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
