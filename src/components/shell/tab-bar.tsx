"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListOrdered, Dumbbell, Swords, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/play", label: "Play", Icon: Swords },
  { href: "/review", label: "Review", Icon: ListOrdered },
  { href: "/practise", label: "Practise", Icon: Dumbbell },
  { href: "/profile", label: "Profile", Icon: UserRound },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const isCurrent = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`) || (href === "/play" && pathname.startsWith("/g/"));

  return (
    <nav aria-label="Primary navigation" className="sticky bottom-0 z-40 flex shrink-0 border-t bg-background/95 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-sm sm:hidden">
      {TABS.map(({ href, label, Icon }) => {
        const current = isCurrent(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-2xs transition-colors",
              current ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
