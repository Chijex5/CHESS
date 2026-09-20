"use client";

import { useEffect, useRef, useState } from "react";
import { BellOff, MessageSquare, Send, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ChatLine } from "@/lib/multiplayer/chat";
import type { Seat } from "@/lib/multiplayer/protocol";
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
import { useKeyboardInset } from "@/lib/ui/use-keyboard-inset";

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
          <p className="py-6 text-center text-sm text-muted-foreground">
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
 *
 * And a bubble. The cue and a six-pixel dot on a button were the whole announcement
 * of a message, and on a phone with the board taking the screen that is nothing at
 * all — people sent "good game" and were never answered. Now their newest line pops
 * up over the board where you are already looking, for long enough to read and tap.
 */

/** Long enough to read a sentence and decide; short enough not to sit over the board
 *  through the next three moves. */
const BUBBLE_MS = 6_000;

export function MobileChat({ gameId }: { gameId: string }) {
  const unread = useOnline((state) => state.unread);
  const chat = useOnline((state) => state.chat);
  const seat = useOnline((state) => state.seat);
  const muted = useOnline((state) => state.muted);
  const snapshot = useOnline((state) => state.snapshot);
  const [open, setOpen] = useState(false);
  const inset = useKeyboardInset();

  /* The bubble shows the newest line that is theirs, unread, and not yet faded. The
     first three conditions are the store's — the same ones that decide `unread` — and
     the last is a fade timer keyed on the line's id, so a second message replaces the
     first rather than stacking under it. */
  const latest = lastTheirs(chat, seat);
  const [faded, setFaded] = useState(0);
  const bubble =
    !open && !muted && unread > 0 && latest && latest.id > faded ? latest : null;
  const bubbleId = bubble?.id ?? 0;
  useEffect(() => {
    if (!bubbleId) return;
    const timer = setTimeout(() => setFaded(bubbleId), BUBBLE_MS);
    return () => clearTimeout(timer);
  }, [bubbleId]);

  const opponent = seat && snapshot ? snapshot[opposite(seat)]?.username : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) useOnline.getState().markChatRead();
      }}
    >
      <span className="relative lg:hidden">
        <SheetTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1.5 text-xs">
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

        {bubble && (
          <button
            type="button"
            onClick={() => {
              setFaded(bubble.id);
              setOpen(true);
              useOnline.getState().markChatRead();
            }}
            className="absolute end-0 bottom-full z-30 mb-2 w-[min(18rem,80vw)] animate-in fade-in-0 slide-in-from-bottom-2 rounded-xl border bg-muted px-3 py-2 text-start shadow-lg"
          >
            {opponent && (
              <span className="block truncate text-2xs font-medium text-muted-foreground">
                {opponent}
              </span>
            )}
            <span className="line-clamp-2 text-sm break-words">{bubble.body}</span>
            {/* The caret, pointing at the button that opens the rest. */}
            <span
              aria-hidden
              className="absolute end-4 top-full size-2 -translate-y-1 rotate-45 border-e border-b bg-muted"
            />
          </button>
        )}
      </span>

      {/* Two things about the height. The class needs the `data-[side=bottom]:` prefix
          or the primitive's own `h-auto` outranks it (see `mobile-coach-dock`), which
          had this sheet sizing to its contents. And where the keyboard slides over the
          page instead of shrinking it — iOS — the sheet is lifted by the keyboard's
          height and capped to what is left, so the input stays on screen. */}
      <SheetContent
        side="bottom"
        className="flex flex-col p-0 data-[side=bottom]:h-[70svh]"
        style={
          inset
            ? { bottom: inset, maxHeight: `calc(100svh - ${inset}px - 1rem)` }
            : undefined
        }
      >
        <SheetHeader className="shrink-0 border-b px-3 py-2.5">
          <SheetTitle className="text-sm">Chat</SheetTitle>
        </SheetHeader>
        <ChatPanel gameId={gameId} className="min-h-0 flex-1" />
      </SheetContent>
    </Sheet>
  );
}

/** The newest line from the other chair, or null. */
function lastTheirs(chat: ChatLine[], seat: Seat | null): ChatLine | null {
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i].seat !== seat) return chat[i];
  }
  return null;
}
function opposite(seat: string) {
  return seat === "white" ? "black" : "white";
}

