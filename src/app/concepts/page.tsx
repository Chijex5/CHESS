import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { CONCEPTS } from "@/lib/coach/concepts";
import type { Concept } from "@/lib/chess/types";

export const metadata = { title: "Concepts · AI Chess Coach" };

const FAMILIES: { key: Concept["family"]; label: string; note: string }[] = [
  {
    key: "tactical",
    label: "Tactics",
    note: "Patterns that win material in a move or two. These are what the coach cites most, because they are what most games turn on.",
  },
  {
    key: "positional",
    label: "Position",
    note: "Slower advantages. Nothing here wins a piece today; all of it decides who has the easier game in twenty moves.",
  },
  { key: "opening", label: "Openings", note: "" },
  { key: "endgame", label: "Endgames", note: "" },
];

export default function ConceptsPage() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[70rem] flex-1 px-3 py-6 sm:px-5">
        <div className="mb-6 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Concepts</h1>
          <p className="mt-2 font-serif text-base leading-relaxed text-muted-foreground">
            The {CONCEPTS.length} principles the coach retrieves from, and the whole
            curriculum behind the app. Every citation in a game note links back here,
            every drill quotes the &ldquo;when it applies&rdquo; line from one of
            these pages, and nothing the coach says is grounded in anything else — so
            an explanation can always be checked against the principle it rests on.
          </p>
        </div>

        {FAMILIES.map(({ key, label, note }) => {
          const items = CONCEPTS.filter((c) => c.family === key);
          if (items.length === 0) return null;
          return (
            <section key={key} className="mb-8">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold">{label}</h2>
                <span className="tnum font-mono text-2xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {note && (
                <p className="mb-3 max-w-2xl font-serif text-sm leading-relaxed text-muted-foreground">
                  {note}
                </p>
              )}
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/concepts/${c.slug}`}
                      className="group flex h-full flex-col rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/30"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <BookOpen className="size-3.5 text-primary" aria-hidden />
                        {c.name}
                        <ArrowRight
                          className="ms-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-1.5 font-serif text-sm leading-relaxed text-muted-foreground">
                        {c.blurb}
                      </span>
                      {/* The pattern to hunt for, not the definition again. It is
                          the line a player rereads before a move. */}
                      {c.look && (
                        <span className="mt-2.5 border-t pt-2.5 font-serif text-xs leading-relaxed text-muted-foreground/80">
                          {c.look}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </>
  );
}
