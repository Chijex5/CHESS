"use client";

import { clocksNow, turnOf } from "@/lib/multiplayer/controller";
import { useOnline } from "@/lib/store/online-store";
import { ClockFace } from "./clock-face";
import type { Seat } from "@/lib/multiplayer/protocol";

/* The online clock projects from the last server-stamped snapshot rather than
   banking time locally. It has no authority: reaching zero here does not end the
   game, it only asks the server — which is settling flag-fall on every snapshot
   anyway, so the request is usually redundant and always harmless. */
export function OnlineClock({ seat, className }: { seat: Seat; className?: string }) {
  const initialMs = useOnline((state) => state.snapshot?.initialMs ?? 0);
  if (initialMs === 0) return null;

  return (
    <ClockFace
      side={seat}
      read={() => clocksNow(useOnline.getState().snapshot)[seat]}
      running={() => {
        const snapshot = useOnline.getState().snapshot;
        return snapshot?.status === "active" && turnOf(snapshot, null) === seat;
      }}
      onFlag={() => {
        /* A GET is enough: `snapshot()` settles an expired clock server-side, so
           asking for the state *is* the claim. Nothing is asserted from here, which
           means a client with a fast clock cannot flag its opponent early. */
        const id = useOnline.getState().gameId;
        if (id) void fetch(`/api/game/${id}`, { cache: "no-store" });
      }}
      className={className}
    />
  );
}
