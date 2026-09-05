"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Crown, Dumbbell, ListOrdered, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { SoundToggle } from "./sound-toggle";

const NAV = [
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/review", label: "Review", Icon: ListOrdered },
  { href: "/practise", label: "Practise", Icon: Dumbbell },
  { href: "/concepts", label: "Concepts", Icon: BookOpen },
] as const;

export function AppHeader({
  right,
  className,
}: {
  right?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-sm sm:gap-3 sm:px-5",
        className,
      )}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary/12 text-primary">
          <Crown className="size-4" aria-hidden />
        </span>
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">
          AI Chess Coach
        </span>
      </Link>

      {/* Icons on a phone, words from sm up. Previously the whole nav was
          `hidden md:flex`, which left review and concepts unreachable on the
          device most likely to be holding the app. */}
      <nav className="ms-1 flex min-w-0 items-center gap-0.5 sm:ms-2">
        {NAV.map(({ href, label, Icon }) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
                current
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0 sm:hidden" aria-hidden />
              <span className="max-sm:sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        {right}
        <SoundToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}
