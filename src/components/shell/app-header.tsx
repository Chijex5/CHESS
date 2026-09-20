"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Crown,
  Dumbbell,
  ListOrdered,
  MoreHorizontal,
  Settings,
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
   From `sm` up this is the navigation: a wordmark, the ways to start a game, and the
   four destinations, flat and labelled.

   Below `sm` it is not. `TabBar` sits at the bottom of the same shell holding Home,
   Play, Review, Practise and Profile where a thumb can reach them, so a phone having
   a second copy of those five links behind a "More" glyph at the top of the screen
   was two navigations competing to be the answer. What is left up here on a phone is
   what a tab bar cannot hold: the things that are settings rather than places, and
   who you are signed in as.
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

      {/* The whole nav row is `sm` and up. On a phone the tab bar is the navigation. */}
      <nav className="ms-1 hidden min-w-0 items-center gap-0.5 sm:flex">
        <PlayMenu active={playing} />

        {SECONDARY.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent(href) ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
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

        {/* What a tab bar cannot hold: settings rather than places. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="sm:hidden">
              <MoreHorizontal className="size-4" aria-hidden />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/concepts" aria-current={isCurrent("/concepts") ? "page" : undefined}>
                <BookOpen className="size-4" aria-hidden />
                Concepts
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" aria-current={isCurrent("/settings") ? "page" : undefined}>
                <Settings className="size-4" aria-hidden />
                Settings
              </Link>
            </DropdownMenuItem>
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
