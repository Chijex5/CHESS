import type { Evaluation } from "@/lib/chess/types";

export const ENGINE_URL = "/engine/stockfish-18-lite-single.js";

export type SearchInfo = {
  depth: number;
  /** Always normalised to White's perspective. */
  evaluation: Evaluation;
  /** Principal variation in UCI coordinate notation. */
  pv: string[];
  nodes?: number;
  nps?: number;
};

export type SearchResult = SearchInfo & { bestMove: string | null };

export type SearchRequest = {
  fen: string;
  /** Fixed depth. Use this for analysis so evals are comparable. */
  depth?: number;
  /** Wall-clock budget. Use this for the opponent so it feels responsive. */
  movetimeMs?: number;
  onInfo?: (info: SearchInfo) => void;
  /** Jump the queue. There is one analyst and it runs one search at a time, so a
   *  search for the position the player is sitting in has to be able to overtake
   *  commentary about a move already played — otherwise the hint waits on a note
   *  nobody asked for yet. Does not interrupt a search already running. */
  priority?: boolean;
  signal?: AbortSignal;
};

/** UCI reports scores from the side-to-move's point of view. Everything above
 *  this line normalises to White so deltas can be subtracted without thinking. */
function normalise(
  kind: "cp" | "mate",
  value: number,
  fen: string,
): Evaluation {
  const whiteToMove = fen.split(" ")[1] !== "b";
  const signed = whiteToMove ? value : -value;
  if (kind === "cp") return { kind: "cp", cp: signed };
  /* `mate 0` means the side to move is already mated, and negating zero does not
     record who won. Name the winner instead: it is whoever is *not* to move. */
  if (value === 0) return { kind: "mated", winner: whiteToMove ? "black" : "white" };
  return { kind: "mate", movesToMate: signed };
}

type Pending = {
  resolve: (result: SearchResult) => void;
  reject: (error: Error) => void;
  request: SearchRequest;
  latest: SearchInfo;
};

/**
 * One Stockfish worker behind a promise API.
 *
 * UCI is strictly serial per instance — a second `go` before `bestmove` corrupts
 * both searches — so commands run through a queue and only one search is ever in
 * flight. Callers never touch the worker directly.
 */
export class UciEngine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private pending: Pending | null = null;
  private queue: Array<() => void> = [];
  private lineHandlers = new Set<(line: string) => void>();

  constructor(private readonly options: Record<string, string | number | boolean> = {}) {}

  /** Boots the worker and applies UCI options. Safe to call repeatedly. */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      if (typeof window === "undefined") {
        reject(new Error("The engine only runs in the browser."));
        return;
      }
      const worker = new Worker(ENGINE_URL);
      this.worker = worker;

      worker.onerror = (event) => reject(new Error(event.message || "Engine failed to load"));
      worker.onmessage = (event: MessageEvent) => {
        const data = typeof event.data === "string" ? event.data : event.data?.data;
        if (typeof data !== "string") return;
        for (const line of data.split("\n")) this.handleLine(line.trim());
      };

      const onLine = (line: string) => {
        if (line === "uciok") {
          for (const [name, value] of Object.entries(this.options)) {
            this.send(`setoption name ${name} value ${value}`);
          }
          this.send("isready");
        } else if (line === "readyok") {
          this.lineHandlers.delete(onLine);
          this.rejectReady = null;
          resolve();
        }
      };
      this.lineHandlers.add(onLine);
      this.send("uci");
    });
    return this.ready;
  }

  async setOption(name: string, value: string | number | boolean) {
    await this.init();
    this.options[name] = value;
    this.send(`setoption name ${name} value ${value}`);
  }

  /** Queued so concurrent callers cannot interleave two searches. */
  search(request: SearchRequest): Promise<SearchResult> {
    return new Promise<SearchResult>((resolve, reject) => {
      const run = async () => {
        try {
          await this.init();
        } catch (error) {
          reject(error as Error);
          this.next();
          return;
        }
        if (request.signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          this.next();
          return;
        }

        this.pending = {
          resolve,
          reject,
          request,
          latest: {
            depth: 0,
            evaluation: { kind: "cp", cp: 0 },
            pv: [],
          },
        };

        const onAbort = () => this.send("stop");
        request.signal?.addEventListener("abort", onAbort, { once: true });

        this.send("stop");
        this.send(`position fen ${request.fen}`);
        this.send(
          request.movetimeMs
            ? `go movetime ${Math.round(request.movetimeMs)}`
            : `go depth ${request.depth ?? 16}`,
        );
      };

      if (request.priority) this.queue.unshift(run);
      else this.queue.push(run);
      if (!this.pending && this.queue.length === 1) this.next();
    });
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    // A boot still in flight must be settled, or every awaiting caller hangs
    // forever on a worker that no longer exists.
    this.rejectReady?.(new DOMException("Aborted", "AbortError"));
    this.rejectReady = null;
    this.ready = null;
    this.pending?.reject(new DOMException("Aborted", "AbortError"));
    this.pending = null;
    this.queue = [];
    this.lineHandlers.clear();
  }

  private next() {
    this.pending = null;
    const run = this.queue.shift();
    run?.();
  }

  private send(command: string) {
    this.worker?.postMessage(command);
  }

  private handleLine(line: string) {
    if (!line) return;
    for (const handler of this.lineHandlers) handler(line);

    const pending = this.pending;
    if (!pending) return;

    if (line.startsWith("info ")) {
      const info = parseInfo(line, pending.request.fen);
      if (info) {
        pending.latest = info;
        pending.request.onInfo?.(info);
      }
      return;
    }

    if (line.startsWith("bestmove")) {
      const bestMove = line.split(/\s+/)[1] ?? null;
      const result: SearchResult = {
        ...pending.latest,
        bestMove: bestMove === "(none)" ? null : bestMove,
      };
      const { resolve, reject, request } = pending;
      this.next();
      if (request.signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      else resolve(result);
    }
  }
}

/** Parses one `info` line. Lower-depth and bound-only lines are skipped so the
 *  caller never sees a score that the search has not actually committed to. */
export function parseInfo(line: string, fen: string): SearchInfo | null {
  const tokens = line.split(/\s+/);
  const read = (key: string) => {
    const i = tokens.indexOf(key);
    return i === -1 ? undefined : tokens[i + 1];
  };

  // MultiPV > 1 lines describe alternatives, not the main line.
  const multipv = read("multipv");
  if (multipv && multipv !== "1") return null;

  const scoreIndex = tokens.indexOf("score");
  if (scoreIndex === -1) return null;
  const kind = tokens[scoreIndex + 1];
  if (kind !== "cp" && kind !== "mate") return null;
  const value = Number(tokens[scoreIndex + 2]);
  if (!Number.isFinite(value)) return null;

  const pvIndex = tokens.indexOf("pv");
  return {
    depth: Number(read("depth") ?? 0),
    evaluation: normalise(kind, value, fen),
    pv: pvIndex === -1 ? [] : tokens.slice(pvIndex + 1),
    nodes: Number(read("nodes")) || undefined,
    nps: Number(read("nps")) || undefined,
  };
}
