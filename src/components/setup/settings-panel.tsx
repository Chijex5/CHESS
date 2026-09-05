"use client";

import { Info, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  DEFAULT_SETTINGS,
  LEVEL_VERBOSITY,
  SENSITIVITY_THRESHOLD,
  type BoardTheme,
  type Level,
  type EvalVisibility,
  type PlaySide,
  type Sensitivity,
  type Settings,
  type Timing,
  type Verbosity,
} from "@/lib/store/settings-store";
import { ELO_MAX, ELO_MIN } from "@/lib/engine/manager";
import { OPPONENTS, isNamedElo, opponentFor } from "@/lib/engine/opponents";
import {
  TIME_CONTROLS,
  timeControlFor,
  type TimeControlId,
} from "@/lib/game/time-controls";

export { DEFAULT_SETTINGS };
export type { Settings, BoardTheme };

/* UCI_Elo accepts 1320–3190 (Stockfish's own Search::Skill bounds), so the tiers
   below are real engine settings rather than invented levels. */


/* One question the player can actually answer about themselves, in place of two
   they cannot ("how verbose?" and "what vocabulary?"). Picking a level sets the
   length as well; Advanced still exposes the raw dial for anyone who wants it. */
const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "new", label: "New to chess", hint: "Every term explained in plain words" },
  { value: "improving", label: "Improving", hint: "Pin, fork and open file left unglossed" },
  { value: "club", label: "Club player", hint: "Normal chess vocabulary, briefly" },
];


const SIDES: { value: PlaySide; label: string }[] = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "random", label: "Random" },
];

/* Named for the mistake, not for its glyph. "?? only" and "? and worse" are
   Informator punctuation: correct, and unreadable to anyone who has not spent an
   evening with a tournament bulletin. The severity ladder is the same. */
const SENSITIVITIES: { value: Sensitivity; label: string; covers: string }[] = [
  { value: "blunders", label: "Blunders", covers: "Only the moves that throw the game away." },
  { value: "mistakes", label: "Mistakes", covers: "Mistakes and blunders." },
  {
    value: "inaccuracies",
    label: "Inaccuracies",
    covers: "Inaccuracies, mistakes and blunders.",
  },
  { value: "every", label: "Every move", covers: "Every move you play, good or bad." },
];

/* Each of these now describes something the app actually does. Until recently
   "As you move" and "After the reply" were the same code path, so the note under
   the control was describing a distinction that did not exist. */
const TIMINGS: { value: Timing; label: string; note: string }[] = [
  {
    value: "immediate",
    label: "As you move",
    note: "The note starts writing the moment you move, while your opponent is still thinking.",
  },
  {
    value: "after-reply",
    label: "After the reply",
    note: "Held until your opponent has answered, so a note never lands on a position that is about to change.",
  },
  {
    value: "post-game",
    label: "End of game",
    note: "Nothing during play — the whole set arrives at the end. Being told mid-game that a better move existed is itself a hint.",
  },
];

/** Sensitivity is also the cost dial, so the threshold is shown next to it. */
const CALL_ESTIMATE: Record<Sensitivity, string> = {
  blunders: `≥${SENSITIVITY_THRESHOLD.blunders}% swing · ~2 / game`,
  mistakes: `≥${SENSITIVITY_THRESHOLD.mistakes}% swing · ~5 / game`,
  inaccuracies: `≥${SENSITIVITY_THRESHOLD.inaccuracies}% swing · ~11 / game`,
  every: "every move · ~40 / game",
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && (
          <span className="tnum shrink-0 font-mono text-2xs text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

const group =
  "w-full justify-start gap-1 [&>button]:h-8 [&>button]:flex-1 [&>button]:text-xs";

export function SettingsPanel({
  value,
  onChange,
  className,
}: {
  value: Settings;
  onChange: (next: Settings) => void;
  className?: string;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className={cn("space-y-5", className)}>
      <section className="space-y-4">
        <h3 className="eyebrow">
          You
        </h3>
        <Row label="You play">
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.side}
            onValueChange={(v) => v && set("side", v as PlaySide)}
          >
            {SIDES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="pt-1 text-2xs leading-snug text-muted-foreground">
            Takes effect on your next game.
          </p>
        </Row>
        <Row label="Chess experience">
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.level}
            onValueChange={(v) =>
              v &&
              onChange({
                ...value,
                level: v as Level,
                // Length follows from the level unless Advanced overrides it later.
                verbosity: LEVEL_VERBOSITY[v as Level],
              })
            }
          >
            {LEVELS.map((l) => (
              <ToggleGroupItem key={l.value} value={l.value}>
                {l.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="pt-1 text-2xs leading-snug text-muted-foreground">
            {LEVELS.find((l) => l.value === value.level)?.hint}
            {value.level !== "club" &&
              " · warns you before you leave a piece undefended"}
          </p>
        </Row>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="eyebrow">
          Opponent
        </h3>
        {/* Off by default. A clock running while you read a paragraph about the
            move you just played is a penalty for using the app. */}
        <Row
          label="Clock"
          hint={timeControlFor(value.timeControl).incrementMs > 0 ? "with increment" : undefined}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.timeControl}
            onValueChange={(v) => v && set("timeControl", v as TimeControlId)}
          >
            {TIME_CONTROLS.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id}>
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="pt-1 text-2xs leading-snug text-muted-foreground">
            {timeControlFor(value.timeControl).note} Applies to your next game.
          </p>
        </Row>

        {/* Named opponents rather than a rating. Picking one sets its thinking
            time too — a stronger opponent that answers instantly reads as a bug. */}
        <Row label="Opponent" hint={`${value.elo} Elo`}>
          <div className="grid gap-1.5">
            {OPPONENTS.map((o) => {
              const picked = opponentFor(value.elo).id === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onChange({ ...value, elo: o.elo, thinkMs: o.thinkMs })}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-left transition-colors",
                    picked
                      ? "border-primary/45 bg-primary/[0.06]"
                      : "hover:border-primary/25 hover:bg-accent/40",
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{o.name}</span>
                    <span className="tnum font-mono text-2xs text-muted-foreground">
                      {o.elo}
                    </span>
                    {picked && !isNamedElo(value.elo) && (
                      <span className="ms-auto text-2xs text-muted-foreground">
                        set to {value.elo}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-serif text-xs leading-relaxed text-muted-foreground">
                    {o.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </Row>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="eyebrow">
          Coaching
        </h3>
        <Row label="Explain from" hint={CALL_ESTIMATE[value.sensitivity]}>
          {/* Two by two: "Inaccuracies" does not fit a quarter of a 22rem panel. */}
          <ToggleGroup
            type="single"
            variant="outline"
            className="grid w-full grid-cols-2 gap-1 [&>button]:h-8 [&>button]:w-full [&>button]:text-xs"
            value={value.sensitivity}
            onValueChange={(v) => v && set("sensitivity", v as Sensitivity)}
          >
            {SENSITIVITIES.map((s) => (
              <ToggleGroupItem key={s.value} value={s.value}>
                {s.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="pt-1 text-2xs leading-snug text-muted-foreground">
            {SENSITIVITIES.find((s) => s.value === value.sensitivity)?.covers}
          </p>
        </Row>
        <details className="group/adv rounded-lg border px-2.5 py-2">
          <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
            Advanced
            <span className="ms-1.5 text-2xs text-muted-foreground group-open/adv:hidden">
              length is set by your experience
            </span>
          </summary>
          <div className="mt-3 space-y-4">
            <Row label="Length of explanation">
              <ToggleGroup
                type="single"
                variant="outline"
                className={group}
                value={value.verbosity}
                onValueChange={(v) => v && set("verbosity", v as Verbosity)}
              >
                <ToggleGroupItem value="terse">Terse</ToggleGroupItem>
                <ToggleGroupItem value="standard">Standard</ToggleGroupItem>
                <ToggleGroupItem value="deep">Deep</ToggleGroupItem>
              </ToggleGroup>
            </Row>
            {/* Still here for anyone who wants a rating between two names, or an
                opponent that thinks longer than its strength suggests. */}
            <Row label="Exact rating" hint={`${value.elo} Elo`}>
              <Slider
                min={ELO_MIN}
                max={ELO_MAX}
                step={10}
                value={[value.elo]}
                onValueChange={([v]) => set("elo", v)}
              />
            </Row>
            <Row label="Thinking time" hint={`${(value.thinkMs / 1000).toFixed(1)}s / move`}>
              <Slider
                min={200}
                max={3000}
                step={100}
                value={[value.thinkMs]}
                onValueChange={([v]) => set("thinkMs", v)}
              />
            </Row>
          </div>
        </details>
        <Row label="When to speak">
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.timing}
            onValueChange={(v) => v && set("timing", v as Timing)}
          >
            {TIMINGS.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value}>
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="flex items-start gap-1.5 pt-1 text-2xs leading-snug text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            {TIMINGS.find((t) => t.value === value.timing)?.note}
          </p>
        </Row>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
          <div>
            <Label className="text-sm font-medium">Praise good moves</Label>
            <p className="text-2xs text-muted-foreground">
              Also explain the moves you got right.
            </p>
          </div>
          <Switch
            checked={value.praiseGoodMoves}
            onCheckedChange={(v) => set("praiseGoodMoves", v)}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="eyebrow">
          Sound
        </h3>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {value.soundEnabled ? (
              <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <VolumeX className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0">
              <Label className="text-sm font-medium">Board sound</Label>
              <p className="text-2xs text-muted-foreground">
                Pieces landing, captures, check, and one chime per coach note.
              </p>
            </div>
          </div>
          <Switch
            checked={value.soundEnabled}
            onCheckedChange={(v) => set("soundEnabled", v)}
          />
        </div>
        {value.soundEnabled && (
          <Row label="Volume" hint={`${Math.round(value.volume * 100)}%`}>
            <Slider
              min={0}
              max={100}
              step={5}
              value={[Math.round(value.volume * 100)]}
              onValueChange={([v]) => set("volume", v / 100)}
            />
          </Row>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <h3 className="eyebrow">
          Board
        </h3>
        <Row label="Evaluation bar">
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.evalVisibility}
            onValueChange={(v) => v && set("evalVisibility", v as EvalVisibility)}
          >
            <ToggleGroupItem value="always">Always</ToggleGroupItem>
            <ToggleGroupItem value="after-coach">After coach</ToggleGroupItem>
            <ToggleGroupItem value="game-end">Game end</ToggleGroupItem>
          </ToggleGroup>
          <p className="pt-1 text-2xs leading-snug text-muted-foreground">
            A live bar tells you that you blundered before the coach explains why.
          </p>
        </Row>
        <Row label="Set">
          <ToggleGroup
            type="single"
            variant="outline"
            className={group}
            value={value.boardTheme}
            onValueChange={(v) => v && set("boardTheme", v as BoardTheme)}
          >
            <ToggleGroupItem value="walnut">Walnut</ToggleGroupItem>
            <ToggleGroupItem value="tournament">Tournament</ToggleGroupItem>
            <ToggleGroupItem value="slate">Slate</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </section>
    </div>
  );
}
