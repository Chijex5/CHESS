"use client";

import Link from "next/link";
import { ChevronLeft, Home, ListOrdered, MoreHorizontal, Settings, BookOpen, Dumbbell, UserRound, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountButton } from "./account-button";
import { SoundToggle } from "./sound-toggle";
import { ThemeToggle } from "./theme-toggle";

const DESTINATIONS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/review", label: "Review", Icon: ListOrdered },
  { href: "/practise", label: "Practise", Icon: Dumbbell },
  { href: "/profile", label: "Profile", Icon: UserRound },
  { href: "/concepts", label: "Concepts", Icon: BookOpen },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

/** Minimal chrome for the two live board routes. The account control intentionally
 * remains here: it also supplies the archive's signed-in identity. */
export function GameHeader({ label }: { label: string }) {
  return (
    <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-1 border-b bg-background/85 px-2 backdrop-blur-sm sm:h-14 sm:px-5">
      <Button asChild size="icon" variant="ghost" className="size-8">
        <Link href="/" aria-label="Back to home">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
      </Button>
      <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">{label}</p>

      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        <SoundToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8">
              <MoreHorizontal className="size-4" aria-hidden />
              <span className="sr-only">Game menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {DESTINATIONS.map(({ href, label: destination, Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Icon className="size-4" aria-hidden />
                  {destination}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <div className="flex items-center gap-1 px-1 py-0.5">
              <ThemeToggle />
              <span className="ps-1 text-xs text-muted-foreground">Theme</span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountButton />
      </div>
    </header>
  );
}
