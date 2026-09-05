import { AppHeader } from "@/components/shell/app-header";

/* The auth pages keep the app's own header rather than becoming a separate
   world. Signing in is optional here, so the way back to the board has to stay
   visible — a sign-in screen you cannot escape implies an account you must have. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-10">
        {children}
      </main>
    </>
  );
}
