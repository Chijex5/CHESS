"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Crown,
  Dumbbell,
  ListOrdered,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { SoundToggle } from "./sound-toggle";
import { AccountButton } from "./account-button";
import { PlayMenu } from "./play-menu";

/* ── The header ───────────────────────────────────────────────────────────────
   It had nine tap targets in 390px, five of them unlabelled icons that no first-time
   visitor could tell apart — and adding a third way to start a game made it worse.

   Two changes. Starting a game became a menu, because there are now genuinely three
   ways to do it and one link cannot carry them. And on a phone the three secondary
   destinations collapse behind one control, along with sound and theme, which are
   settings rather than places. That is four targets on mobile instead of nine, and
   everything keeps a label at every size — a labelled menu you have to open beats
   five icons you have to guess at.
   ─────────────────────────────────────────────────────────────────────────── */
const SECONDARY = [
  { href: "/profile", label: "Profile", Icon: UserRound },
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
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  /* Every way of starting a game, so the menu reads as current wherever you are in
     one — including an online board, which lives under `/g`. */
  const playing =
    pathname === "/play" || pathname.startsWith("/play/") || pathname.startsWith("/g/");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 shrink-0 items-center gap-1 border-b bg-background/85 px-3 backdrop-blur-sm sm:gap-2 sm:px-5",
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

      <nav className="ms-1 flex min-w-0 items-center gap-0.5">
        <PlayMenu active={playing} />

        {/* Flat from sm up, where the labels fit. */}
        {SECONDARY.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent(href) ? "page" : undefined}
            className={cn(
              "hidden h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors sm:flex",
              isCurrent(href)
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        {right}

        {/* Phones get one control holding the rest. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8 sm:hidden">
              <MoreHorizontal className="size-4" aria-hidden />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {SECONDARY.map(({ href, label, Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} aria-current={isCurrent(href) ? "page" : undefined}>
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {/* Rendered as menu rows rather than the icon buttons, so the labels
                explain what they do. */}
            <div className="flex items-center gap-1 px-1 py-0.5">
              <SoundToggle />
              <ThemeToggle />
              <span className="ps-1 text-xs text-muted-foreground">Sound · theme</span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden items-center gap-0.5 sm:flex">
          <SoundToggle />
          <ThemeToggle />
        </span>

        <AccountButton />
      </div>
    </header>
  );
}
