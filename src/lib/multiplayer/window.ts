/** The pairing window, phrased for the searching screen.
 *
 *  Deliberately a separate module from `queue.ts`, which is `server-only`: the client
 *  needs to *describe* the window it is searching in, and importing the queue to get
 *  one number would drag Redis into the browser bundle. */
export function pairingWindowLabel(waitedMs: number): string {
  const points = Math.round(Math.min(500, 100 + (waitedMs / 60_000) * 300) / 10) * 10;
  return `±${points}`;
}
