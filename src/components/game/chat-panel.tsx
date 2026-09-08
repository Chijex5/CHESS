"use client";

import { useEffect, useRef, useState } from "react";
import { BellOff, MessageSquare, Send, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sendChat } from "@/lib/multiplayer/client";
import { useOnline } from "@/lib/store/online-store";
import { MAX_BODY } from "@/lib/multiplayer/chat";
import { playCue } from "@/lib/audio/sfx";

/* ── Saying something ─────────────────────────────────────────────────────────
   Two people, no moderator, and therefore two controls that belong to the person
   being talked at rather than to a queue nobody reads: mute, here, and block, on the
   profile. Neither is announced. A mute the other player can detect is a mute that
   starts the argument it was meant to end.

   Everything else is the server's: two hundred characters, ten messages in thirty
   seconds, and nothing at all once the rematch window shuts.
   ─────────────────────────────────────────────────────────────────────────── */

const REFUSAL: Record<string, string> = {
  "too-fast": "Slow down a moment.",
  "too-long": "Too long.",
  "chat-closed": "The game is over.",
  "not-available": "Not available.",
  empty: "",
};

export function ChatPanel({ gameId, className }: { gameId: string; className?: string }) {
  const chat = useOnline((state) => state.chat);
  const seat = useOnline((state) => state.seat);
  const muted = useOnline((state) => state.muted);
  const [draft, setDraft] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const shown = muted ? chat.filter((line) => line.seat === seat) : chat;

  /* Scrolled on arrival rather than on render: a new line should bring itself into
     view, and nothing else here moves. */
  const count = shown.length;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  /* A cue for their message only. Ours is already on screen because we typed it, and a
     muted opponent's is not something to be told about. */
  const theirs = shown.filter((line) => line.seat !== seat).length;
  const heard = useRef(theirs);
  useEffect(() => {
    if (theirs > heard.current) playCue("note");
    heard.current = theirs;
  }, [theirs]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const result = await sendChat(gameId, body);
    setSending(false);
    if (result.ok) {
      setDraft("");
      setRefusal(null);
      /* Not appended locally. The snapshot's cursor moves and the delta fetch brings it
         back with the id and timestamp the server gave it — one path in, so there is no
         optimistic copy to reconcile with the real one. */
      return;
    }
    setRefusal(REFUSAL[result.reason] ?? "Not sent.");
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {shown.length === 0 ? (
          <p className="py-6 text-center font-serif text-sm text-muted-foreground">
            {muted ? "Muted for this game." : "Nothing said yet."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((line) => {
              const mine = line.seat === seat;
              return (
                <li
                  key={line.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <span
                    className={cn(
                      /* `break-words` rather than `truncate`: a long message wraps, and
                         cropping somebody's sentence is worse than three lines. */
                      "max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm break-words",
                      mine
                        ? "bg-primary/12 text-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {line.body}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      {refusal && (
        <p className="shrink-0 px-3 pb-1 text-2xs text-q-inaccuracy-ink">{refusal}</p>
      )}

      <form
        className="flex shrink-0 items-center gap-1.5 border-t p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_BODY}
          placeholder={muted ? "Muted" : "Say something"}
          aria-label="Message your opponent"
          autoComplete="off"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm placeholder:text-muted-foreground/50"
        />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="size-8 shrink-0 p-0"
          disabled={sending || draft.trim().length === 0}
          aria-label="Send"
        >
          <Send className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("size-8 shrink-0 p-0", muted && "text-q-inaccuracy-ink")}
          aria-pressed={muted}
          title={muted ? "Unmute your opponent" : "Mute your opponent"}
          onClick={() => useOnline.getState().setMuted(!muted)}
        >
          {muted ? (
            <VolumeX className="size-3.5" aria-hidden />
          ) : (
            <BellOff className="size-3.5" aria-hidden />
          )}
        </Button>
      </form>
    </div>
  );
}

/** The tab button, with the unread dot. Exported so the rail can own the layout. */
export function ChatTabLabel() {
  const unread = useOnline((state) => state.unread);
  return (
    <>
      <MessageSquare className="size-3.5" aria-hidden />
      Chat
      {unread > 0 && (
        <span
          className="ms-0.5 size-1.5 rounded-full bg-primary"
          aria-label={`${unread} unread`}
        />
      )}
    </>
  );
}

/**
 * The same panel, on a phone.
 *
 * The rail it lives in is `hidden lg:flex`, so without this a message arriving on a
 * phone would play its cue and then be unreachable — the worst of both, a notification
 * for something you cannot read. A sheet rather than a second layout: it is the same
 * component, given a full-height container.
 */
export function MobileChat({ gameId }: { gameId: string }) {
  const unread = useOnline((state) => state.unread);
  const [open, setOpen] = useState(false);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) useOnline.getState().markChatRead();
      }}
    >
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1.5 text-xs lg:hidden"
        >
          <MessageSquare className="size-3.5" aria-hidden />
          Chat
          {unread > 0 && (
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-label={`${unread} unread`}
            />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="flex h-[70svh] flex-col p-0">
        <SheetHeader className="shrink-0 border-b px-3 py-2.5">
          <SheetTitle className="text-sm">Chat</SheetTitle>
        </SheetHeader>
        <ChatPanel gameId={gameId} className="min-h-0 flex-1" />
      </SheetContent>
    </Sheet>
  );
}
