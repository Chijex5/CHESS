"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  ShieldOff,
  Swords,
  UserPlus,
  UserRoundX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createGame } from "@/lib/multiplayer/client";
import { TIME_CONTROLS, formatClock, type TimeControlId } from "@/lib/game/time-controls";
import type { FriendList, Person } from "@/lib/multiplayer/friends-db";

/* ── People ───────────────────────────────────────────────────────────────────
   A list rather than a presence system. Challenging a friend creates a game with
   their name on it and leaves it pending, so they find it whenever they next look —
   an invite that waited. That is the whole feature, and it needs no heartbeat, no
   sweeper and no background traffic.

   Blocking is here rather than buried in a report flow because it is the control that
   actually works: it stops challenges and chat in both directions, and the person
   blocked is never told, only refused.
   ─────────────────────────────────────────────────────────────────────────── */

const CLOCKS = TIME_CONTROLS.filter((control) => control.initialMs > 0);

const MESSAGE: Record<string, string> = {
  "no-such-player": "No player by that name.",
  "thats-you": "That is you.",
  "not-available": "That player is not available.",
  blocked: "You have blocked them. Unblock to play or talk.",
  "no-request": "There is no request to answer.",
  "not-friends": "You are not friends.",
  "sign-in-required": "Sign in first.",
};

export function FriendsPanel() {
  const [list, setList] = useState<FriendList | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenging, setChallenging] = useState<Person | null>(null);

  const load = async () => {
    const response = await fetch("/api/friends", { cache: "no-store" }).catch(() => null);
    if (response?.ok) setList(await response.json());
  };

  /* The same fetch, written out rather than calling `load`, because every action below
     re-reads the whole list and the mount needs a cancellation guard that they do not:
     a reply landing after this panel unmounts would set state on nothing. */
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch("/api/friends", { cache: "no-store" }).catch(() => null);
      if (live && response?.ok) setList(await response.json());
    })();
    return () => {
      live = false;
    };
  }, []);

  const send = async (url: string, body: object) => {
    setBusy(true);
    setError(null);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const reason = ((await response?.json().catch(() => null)) as { error?: string } | null)
        ?.error;
      setError(MESSAGE[reason ?? ""] ?? "That did not work.");
      return false;
    }
    await load();
    return true;
  };

  const add = async () => {
    const username = name.trim();
    if (!username) return;
    if (await send("/api/friends", { username })) setName("");
  };

  const act = (person: Person, action: string) =>
    void send(`/api/friends/${encodeURIComponent(person.username)}`, { action });

  if (!list) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="friend-username" className="text-xs">
            Add by username
          </Label>
          {/* A plain input, styled like the invite-code field rather than through a
              primitive — this project has no `Input` component and one field does not
              justify introducing one. */}
          <input
            id="friend-username"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="their handle"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm placeholder:text-muted-foreground/50"
          />
        </div>
        <Button type="submit" className="h-9 shrink-0" disabled={busy || !name.trim()}>
          <UserPlus className="size-4" aria-hidden /> Ask
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Challenges first: somebody is waiting at a board. */}
      <Group title="Waiting for you" people={list.challenges.length}>
        {list.challenges.map((challenge) => (
          <Row key={challenge.gameId} person={challenge.from}>
            <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
              {formatClock(challenge.initialMs)}
            </span>
            <Button asChild size="sm" className="h-7 shrink-0 text-xs">
              <a href={`/g/${challenge.gameId}`}>
                <Swords className="size-3.5" aria-hidden /> Play
              </a>
            </Button>
          </Row>
        ))}
      </Group>

      <Group title="Asked to be friends" people={list.incoming.length}>
        {list.incoming.map((person) => (
          <Row key={person.id} person={person}>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => act(person, "accept")}
            >
              <Check className="size-3.5" aria-hidden /> Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => act(person, "decline")}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs text-muted-foreground"
              disabled={busy}
              title="Block"
              onClick={() => act(person, "block")}
            >
              <UserRoundX className="size-3.5" aria-hidden />
            </Button>
          </Row>
        ))}
      </Group>

      <Group title="Friends" people={list.friends.length} empty="Nobody yet.">
        {list.friends.map((person) => (
          <Row key={person.id} person={person}>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 text-xs"
              onClick={() => setChallenging(person)}
            >
              <Swords className="size-3.5" aria-hidden /> Challenge
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs text-muted-foreground"
              disabled={busy}
              title="Remove"
              onClick={() => act(person, "remove")}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </Row>
        ))}
      </Group>

      <Group title="Waiting on them" people={list.outgoing.length}>
        {list.outgoing.map((person) => (
          <Row key={person.id} person={person}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => act(person, "decline")}
            >
              Withdraw
            </Button>
          </Row>
        ))}
      </Group>

      <Group title="Blocked" people={list.blocked.length}>
        {list.blocked.map((person) => (
          <Row key={person.id} person={person}>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 text-xs"
              disabled={busy}
              onClick={() => act(person, "unblock")}
            >
              <ShieldOff className="size-3.5" aria-hidden /> Unblock
            </Button>
          </Row>
        ))}
      </Group>

      <ChallengeDialog person={challenging} onClose={() => setChallenging(null)} />
    </div>
  );
}

/** The clock, then straight to the board — the same shape as creating a link game, so
 *  the host waits where they will play rather than on a confirmation screen. */
function ChallengeDialog({
  person,
  onClose,
}: {
  person: Person | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [timeControl, setTimeControl] = useState<TimeControlId>("rapid10");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    if (!person) return;
    setSending(true);
    setError(null);
    const created = await createGame({
      side: "random",
      timeControl,
      invite: person.username,
    });
    if ("error" in created) {
      setSending(false);
      setError(MESSAGE[created.error] ?? "Could not create the game.");
      return;
    }
    router.push(`/g/${created.id}`);
  };

  return (
    <Dialog open={person !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Challenge {person?.username}</DialogTitle>
          <DialogDescription className="font-serif">
            The game waits at the board with their name on it. Nobody else can take the
            seat, and they will find it whenever they next look.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Clock</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full justify-start gap-1 [&>button]:h-9 [&>button]:flex-1 [&>button]:text-xs"
            value={timeControl}
            onValueChange={(value) => value && setTimeControl(value as TimeControlId)}
          >
            {CLOCKS.map((control) => (
              <ToggleGroupItem key={control.id} value={control.id}>
                {control.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button className="w-full" disabled={sending} onClick={() => void go()}>
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Swords className="size-4" aria-hidden />
            )}
            Send it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Group({
  title,
  people,
  empty,
  children,
}: {
  title: string;
  people: number;
  /** Shown when the group is empty. Omit to hide the group entirely, which is right
   *  for the ones that are only news — an empty "Blocked" is not a fact worth a row. */
  empty?: string;
  children: React.ReactNode;
}) {
  if (people === 0 && !empty) return null;
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground">
        {title}
        {people > 0 && <span className="tnum ms-1.5 font-mono">{people}</span>}
      </h3>
      {people === 0 ? (
        <p className="mt-1.5 font-serif text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 divide-y">{children}</ul>
      )}
    </div>
  );
}

function Row({ person, children }: { person: Person; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.username}</span>
      <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
        {person.rating}
        {person.provisional && "?"}
      </span>
      {children}
    </li>
  );
}
