"use client";

/* ── Board sound ──────────────────────────────────────────────────────────────
   Synthesised, not sampled. A chess set makes one sound — a piece landing on
   wood — and that sound is a bandpassed noise transient over a short low body.
   Two oscillators and a noise buffer reproduce it convincingly, which is worth
   more than shipping a folder of .mp3 files: no network cost, no licensing, and
   the same cue can shift pitch to carry meaning (capture lands lower and harder
   than a quiet move).

   Everything is lazy. An AudioContext created before a user gesture starts
   suspended and stays suspended, so the context is built on first use and
   `unlockAudio()` resumes it from inside a real gesture handler.
   ─────────────────────────────────────────────────────────────────────────── */

export type Cue =
  | "move"      // your piece lands
  | "capture"   // something comes off the board
  | "castle"    // two pieces, one move
  | "check"     // the king is addressed
  | "promote"   // a pawn becomes something else
  | "win"
  | "loss"
  | "draw"
  | "note"      // the coach has started writing
  | "back"      // take-back / retry
  | "illegal";  // that move cannot be played

type Ctx = AudioContext & { __master?: GainNode; __noise?: AudioBuffer };

let ctx: Ctx | null = null;
let unlockBound = false;

/** Volume 0–1, and whether cues play at all. Set by the settings store so this
 *  module never imports it and never becomes part of a render cycle. */
let enabled = true;
let volume = 0.6;

export function configureAudio(next: { enabled: boolean; volume: number }) {
  enabled = next.enabled;
  volume = Math.max(0, Math.min(1, next.volume));
  if (ctx?.__master) ctx.__master.gain.value = volume;
}

function context(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const created = new Ctor({ latencyHint: "interactive" }) as Ctx;
  const master = created.createGain();
  master.gain.value = volume;
  master.connect(created.destination);
  created.__master = master;

  // 0.4s of white noise, generated once and reused as the transient for every
  // knock. Regenerating it per cue is audible as CPU jitter on a phone.
  const frames = Math.floor(created.sampleRate * 0.4);
  const buffer = created.createBuffer(1, frames, created.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  created.__noise = buffer;

  ctx = created;
  return ctx;
}

/** Attach one-shot gesture listeners that resume the context. Safe to call on
 *  every mount; it binds at most once. */
export function unlockAudio() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const resume = () => {
    const c = context();
    if (c && c.state === "suspended") void c.resume();
  };
  for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(event, resume, { once: true, passive: true });
  }
}

type ToneSpec = {
  freq: number;
  /** Frequency at the end of the note; omit for a steady pitch. */
  glideTo?: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  decay?: number;
  delay?: number;
};

function tone(c: Ctx, spec: ToneSpec) {
  const {
    freq,
    glideTo,
    type = "sine",
    gain = 0.3,
    attack = 0.004,
    decay = 0.12,
    delay = 0,
  } = spec;
  const at = c.currentTime + delay;
  const osc = c.createOscillator();
  const env = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(glideTo, at + decay);

  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);

  osc.connect(env).connect(c.__master!);
  osc.start(at);
  osc.stop(at + attack + decay + 0.02);
}

type KnockSpec = {
  /** Centre of the bandpass — the "hardness" of the contact. */
  colour: number;
  /** Pitch of the wooden body underneath. */
  body: number;
  gain?: number;
  decay?: number;
  delay?: number;
};

/** A piece landing: noise transient through a bandpass, over a low body. */
function knock(c: Ctx, spec: KnockSpec) {
  const { colour, body, gain = 0.5, decay = 0.055, delay = 0 } = spec;
  const at = c.currentTime + delay;

  const src = c.createBufferSource();
  src.buffer = c.__noise!;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = colour;
  band.Q.value = 1.1;
  const env = c.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  src.connect(band).connect(env).connect(c.__master!);
  src.start(at, 0, decay + 0.02);

  tone(c, {
    freq: body,
    glideTo: body * 0.72,
    type: "triangle",
    gain: gain * 0.55,
    decay: decay * 2.4,
    delay,
  });
}

const CUES: Record<Cue, (c: Ctx) => void> = {
  move: (c) => knock(c, { colour: 1650, body: 186 }),
  capture: (c) => {
    knock(c, { colour: 900, body: 132, gain: 0.62, decay: 0.075 });
    knock(c, { colour: 2100, body: 240, gain: 0.28, decay: 0.03, delay: 0.012 });
  },
  castle: (c) => {
    knock(c, { colour: 1500, body: 176, gain: 0.42 });
    knock(c, { colour: 1500, body: 196, gain: 0.42, delay: 0.085 });
  },
  check: (c) => {
    knock(c, { colour: 1750, body: 196, gain: 0.44 });
    tone(c, { freq: 784, type: "triangle", gain: 0.16, decay: 0.1, delay: 0.05 });
    tone(c, { freq: 1046.5, type: "triangle", gain: 0.14, decay: 0.14, delay: 0.13 });
  },
  promote: (c) => {
    knock(c, { colour: 1600, body: 190, gain: 0.36 });
    [523.25, 659.25, 783.99].forEach((freq, i) =>
      tone(c, { freq, type: "triangle", gain: 0.13, decay: 0.12, delay: 0.05 + i * 0.065 }),
    );
  },
  win: (c) =>
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) =>
      tone(c, { freq, type: "triangle", gain: 0.16, decay: 0.26, delay: i * 0.085 }),
    ),
  loss: (c) =>
    [392, 329.63, 261.63].forEach((freq, i) =>
      tone(c, { freq, type: "triangle", gain: 0.16, decay: 0.3, delay: i * 0.11 }),
    ),
  draw: (c) =>
    [440, 523.25].forEach((freq, i) =>
      tone(c, { freq, type: "triangle", gain: 0.15, decay: 0.24, delay: i * 0.1 }),
    ),
  // Deliberately quiet and high: it arrives mid-game and must not read as a move.
  note: (c) => {
    tone(c, { freq: 1318.5, type: "sine", gain: 0.1, decay: 0.14 });
    tone(c, { freq: 1975.5, type: "sine", gain: 0.05, decay: 0.1, delay: 0.06 });
  },
  back: (c) => knock(c, { colour: 1200, body: 150, gain: 0.34, decay: 0.05 }),
  illegal: (c) => tone(c, { freq: 150, glideTo: 96, type: "sine", gain: 0.22, decay: 0.1 }),
};

export function playCue(cue: Cue) {
  if (!enabled || volume === 0) return;
  const c = context();
  if (!c) return;
  // A cue fired while suspended would be silently swallowed; resuming here means
  // the first move after a page load still sounds.
  if (c.state === "suspended") void c.resume();
  try {
    CUES[cue](c);
  } catch {
    // A dead or over-subscribed AudioContext must never break the game.
  }
}

/** The cue a move earns, from the move itself. Check outranks capture: being in
 *  check is the more urgent fact. Mate reuses the check strike — the caller adds
 *  the outcome chord on top, so a mating move lands and *then* resolves. */
export function cueForMove(move: {
  captured?: unknown;
  promotion?: unknown;
  san: string;
}): Cue {
  if (move.san.includes("+") || move.san.includes("#")) return "check";
  if (move.promotion) return "promote";
  if (move.san.startsWith("O-O")) return "castle";
  if (move.captured) return "capture";
  return "move";
}
