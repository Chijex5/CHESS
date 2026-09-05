"use client";

import { useEffect, useRef } from "react";

/* ── Confetti ─────────────────────────────────────────────────────────────────
   Synthesised on a canvas rather than pulled in as a dependency, for the same
   reason the board sounds are: a few dozen rectangles under gravity is not worth
   14 KB of someone else's code, and drawing it here means the colours are the
   app's own theme tokens instead of a stock rainbow.

   Two burst points at the lower corners, angled inward — a single central
   fountain reads as a slot machine, two side cannons read as a finish line.
   ─────────────────────────────────────────────────────────────────────────── */

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, and its rate of change — a flat rectangle that does not tumble
   *  looks like falling debris rather than paper. */
  spin: number;
  spinRate: number;
  w: number;
  h: number;
  colour: string;
  life: number;
};

const COUNT = 90;
const GRAVITY = 0.0011;
const DRAG = 0.9975;

export function Confetti({ fire }: { fire: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The win is still announced in text and read out by the live region, so
    // skipping the animation costs nothing but the celebration.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* Read the palette off the document so confetti matches whichever theme is
       mounted, rather than hard-coding six hex values that drift. */
    const style = getComputedStyle(document.documentElement);
    const palette = ["--primary", "--q-best", "--q-brilliant", "--q-inaccuracy", "--chart-4"]
      .map((token) => style.getPropertyValue(token).trim())
      .filter(Boolean);
    if (palette.length === 0) palette.push("#d8a25a");

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const pieces: Piece[] = Array.from({ length: COUNT }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const speed = 0.55 + Math.random() * 0.75;
      const angle = (fromLeft ? -1.15 : -1.99) + (Math.random() - 0.5) * 0.6;
      return {
        x: fromLeft ? width * 0.06 : width * 0.94,
        y: height * 0.92,
        vx: Math.cos(angle) * speed * (fromLeft ? 1 : 1),
        vy: Math.sin(angle) * speed,
        spin: Math.random() * Math.PI,
        spinRate: (Math.random() - 0.5) * 0.02,
        w: 5 + Math.random() * 5,
        h: 2 + Math.random() * 3,
        colour: palette[i % palette.length],
        life: 2600 + Math.random() * 1400,
      };
    });

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const frame = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      elapsed += dt;
      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of pieces) {
        if (elapsed > p.life) continue;
        alive += 1;
        p.vy += GRAVITY * dt;
        p.vx *= DRAG;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += p.spinRate * dt;

        // Fade over the last third so pieces leave rather than blink out.
        const fade = Math.max(0, Math.min(1, (p.life - elapsed) / (p.life * 0.34)));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.colour;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    /* The dialog is mid zoom-in when this mounts, so the first measurement is a
       few percent short. A ResizeObserver corrects the backing store once the
       animation settles, which a window listener would never see. */
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [fire]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-50 size-full"
    />
  );
}
