"use client";

import { useSyncExternalStore } from "react";

/* ── How much of the screen the keyboard has ──────────────────────────────────
   `interactive-widget=resizes-content` (see `layout.tsx`) makes the keyboard shrink
   the layout viewport, and everywhere that is honoured this hook reads zero. iOS
   Safari ignores it: the keyboard slides over the page, `100svh` stays what it was,
   and a sheet pinned to `bottom: 0` is pinned to a bottom you can no longer see.

   What iOS does expose is `window.visualViewport` — the part of the page actually on
   screen. The difference between that and the layout viewport is the keyboard, and
   this hook reports it so a sheet can lift itself by that much.
   ─────────────────────────────────────────────────────────────────────────── */

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  viewport.addEventListener("resize", onChange);
  /* Focusing a field scrolls the visual viewport as well as resizing it, and the
     offset matters as much as the height. */
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

function read(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  /* Rounded, so the sheet is not re-laid out for the fractional pixels iOS reports
     while the keyboard is still animating in. Anything under a few pixels is the
     browser's own chrome settling, not a keyboard. */
  const inset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
  return inset > 4 ? inset : 0;
}

/** Pixels of the layout viewport hidden behind the on-screen keyboard. Zero on the
 *  server, on desktops, and wherever the browser has already resized the page. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, read, () => 0);
}
