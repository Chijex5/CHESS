import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/* The coach speaks in a serif. Chess annotation is a literary tradition —
   Informator, Kasparov's Predecessors, every tournament book — and a serif
   voice separates "explanation" from "interface" without a single border. */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Chess Coach",
  description:
    "Play a real engine and get grounded, streaming explanations of every mistake.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ef" },
    { media: "(prefers-color-scheme: dark)", color: "#191714" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" data-board="walnut">
        {/* Inside <body>, not wrapping <html>. Both work today, but Next's cache
            components require it here, and this project is one `next.config`
            flag away from using them. */}
        {/* The URLs are set here rather than through NEXT_PUBLIC_CLERK_SIGN_IN_URL
            because a missing env var silently falls back to Clerk's hosted pages,
            which are themed like Clerk and not like this app. */}
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/play"
          signUpFallbackRedirectUrl="/play"
        >
          <ThemeProvider>
            <TooltipProvider delayDuration={220}>{children}</TooltipProvider>
            <Toaster position="top-center" />
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
