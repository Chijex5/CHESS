import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { TabBar } from "./tab-bar";

/** Shared non-board frame. The tab bar stays in normal flow, so mobile content never
 * disappears behind fixed navigation. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
      <TabBar />
    </>
  );
}
