"use client";

import { Show } from "@clerk/nextjs";
import { Lobby } from "./lobby";
import { Pitch } from "./pitch";

/* Two front doors, one route.

   A signed-in player wants a lobby: their rating, one control that starts a game, and
   what they last played. Somebody who has never been here wants to know what this is,
   because "AI chess coach" is not a category you arrive already understanding. Those
   are different screens, and trying to be both is what made this one a marketing page
   that regular players had to scroll past every visit.

   `<Show>` rather than `useAuth`, matching `account-button.tsx`: it renders `null`
   while the session resolves, so nothing flashes the wrong door. The fallback is the
   pitch, which is also the honest thing to show if auth never resolves — it needs no
   account to be useful. */
export function HomeHero() {
  return (
    <Show when="signed-in" fallback={<Pitch />}>
      <Lobby />
    </Show>
  );
}
