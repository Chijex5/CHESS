import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Eye, TriangleAlert } from "lucide-react";
import { AppHeader } from "@/components/shell/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChessBoard } from "@/components/board/chess-board";
import { CONCEPTS, CONCEPT_BY_SLUG } from "@/lib/coach/concepts";
import { sanToSquares } from "@/lib/game/notation";
import { ConceptSightings } from "./sightings";
import { ConceptDrills } from "./drills";

export function generateStaticParams() {
  return CONCEPTS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/concepts/[slug]">) {
  const { slug } = await params;
  const concept = CONCEPT_BY_SLUG.get(slug);
  return {
    title: concept ? `${concept.name} · AI Chess Coach` : "Concepts · AI Chess Coach",
    description: concept?.blurb,
  };
}

export default async function ConceptPage({ params }: PageProps<"/concepts/[slug]">) {
  const { slug } = await params;
  const concept = CONCEPT_BY_SLUG.get(slug);
  if (!concept) notFound();

  /* Resolved at build time — these pages are prerendered from `generateStaticParams`,
     so the arrow costs nothing at runtime. `scripts/check-concepts.mjs` guarantees
     the move is legal, so a missing arrow here means the corpus changed without the
     check being run. */
  const arrow = concept.example
    ? sanToSquares(concept.example.fen, concept.example.san)
    : null;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-[52rem] flex-1 px-3 py-6 sm:px-5">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ms-2 h-8 text-xs">
          <Link href="/concepts">
            <ArrowLeft className="size-3.5" aria-hidden /> All concepts
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <BookOpen className="size-4 text-primary" aria-hidden />
          <Badge variant="secondary" className="text-2xs uppercase">
            {concept.family}
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{concept.name}</h1>
        <p className="mt-3 font-serif text-base leading-relaxed">{concept.blurb}</p>

        {concept.example && arrow && (
          <figure className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:items-center">
            <div data-board="walnut" className="mx-auto w-full max-w-[17rem]">
              <ChessBoard
                fen={concept.example.fen}
                arrows={[{ ...arrow, kind: "best" }]}
                coordinates={false}
              />
            </div>
            <figcaption>
              <p className="eyebrow">
                {concept.example.fen.includes(" w ") ? "White" : "Black"} to play
              </p>
              <p className="tnum mt-1 font-mono text-lg font-semibold">
                {concept.example.san}
              </p>
              <p className="mt-1.5 font-serif text-base leading-relaxed text-muted-foreground">
                {concept.example.caption}
              </p>
            </figcaption>
          </figure>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {concept.look && (
            <Panel Icon={Eye} title="What to look for" body={concept.look} />
          )}
          {concept.when && <Panel title="When it applies" body={concept.when} />}
        </div>

        {concept.pitfall && (
          <div className="mt-3 flex gap-3 rounded-xl border border-q-inaccuracy/35 bg-q-inaccuracy/[0.06] p-4">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-q-inaccuracy-ink"
              aria-hidden
            />
            <div>
              <h2 className="text-sm font-semibold">How it goes wrong</h2>
              <p className="mt-1 font-serif text-base leading-relaxed text-card-foreground/90">
                {concept.pitfall}
              </p>
            </div>
          </div>
        )}

        <ConceptSightings slug={slug} />
        <ConceptDrills slug={slug} />
      </main>
    </>
  );
}

function Panel({
  Icon,
  title,
  body,
}: {
  Icon?: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {Icon && <Icon className="size-4 text-primary" aria-hidden />}
        {title}
      </h2>
      <p className="mt-1.5 font-serif text-base leading-relaxed text-card-foreground/90">
        {body}
      </p>
    </section>
  );
}
