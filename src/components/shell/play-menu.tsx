"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Cpu, KeyRound, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { looksLikeGameId, normaliseGameId } from "@/lib/multiplayer/ids";

/* There are three ways to start a game now, which is one more than a single nav
   link can carry. Grouping them also gives the invite code somewhere to be typed:
   offering to read a code aloud and then providing nowhere to enter it was a dead
   end the create screen had until now. */
export function PlayMenu({ active }: { active: boolean }) {
  const [joining, setJoining] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "h-8 gap-1 px-2 text-sm bg-accent font-medium text-accent-foreground"
                : "h-8 gap-1 px-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            <Swords className="size-4 shrink-0" aria-hidden />
            Play
            <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuItem asChild>
            <Link href="/play">
              <Cpu className="size-4" aria-hidden />
              <span className="flex flex-col">
                Against the engine
                <span className="text-2xs text-muted-foreground">
                  No account, full coaching
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/play/friend">
              <Users className="size-4" aria-hidden />
              <span className="flex flex-col">
                Play a friend
                <span className="text-2xs text-muted-foreground">
                  Create a game and send the link
                </span>
              </span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJoining(true)}>
            <KeyRound className="size-4" aria-hidden />
            <span className="flex flex-col">
              Join with a code
              <span className="text-2xs text-muted-foreground">
                Six characters from their invite
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <JoinByCode open={joining} onOpenChange={setJoining} />
    </>
  );
}

function JoinByCode({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = looksLikeGameId(code);

  const go = () => {
    if (!valid) return;
    onOpenChange(false);
    setCode("");
    /* Straight to the board rather than validating here. `/g/[id]` already handles
       every case — no such game, already full, finished, not signed in — so a second
       check would only be a second place for those answers to disagree. */
    router.push(`/g/${normaliseGameId(code)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a game</DialogTitle>
          <DialogDescription className="font-serif text-base">
            Type the code your opponent gave you. It is the last part of their invite
            link.
          </DialogDescription>
        </DialogHeader>

        <input
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => event.key === "Enter" && go()}
          placeholder="7FK2MQ"
          maxLength={12}
          spellCheck={false}
          autoCapitalize="characters"
          autoComplete="off"
          aria-label="Invite code"
          className="tnum w-full rounded-lg border bg-background px-3 py-2.5 text-center font-mono text-lg font-semibold tracking-[0.18em] uppercase placeholder:tracking-[0.18em] placeholder:text-muted-foreground/40"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={go}>
            <KeyRound className="size-4" aria-hidden /> Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
