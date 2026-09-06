/** Where to send someone after they sign in.
 *
 *  Validated rather than trusted. `redirect_url` arrives in a query string, so an
 *  attacker can put anything in it — and a sign-in page that will forward to an
 *  arbitrary URL after authenticating is an open redirect, which is exactly the shape
 *  phishing wants: a real link to a real login on the real domain that lands
 *  somewhere else.
 *
 *  So only same-origin *paths* are honoured. Anything absolute, protocol-relative, or
 *  otherwise not starting with a single slash falls back to the board. */
export function safeRedirect(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "/play";

  /* An absolute URL is allowed through only if it is this origin — `proxy.ts` builds
     it from `request.url`, so that is the common case rather than an attack. */
  let path = value;
  if (/^https?:\/\//i.test(value)) {
    try {
      path = new URL(value).pathname + new URL(value).search;
    } catch {
      return "/play";
    }
  }

  // `//evil.example` is protocol-relative and would leave the site.
  if (!path.startsWith("/") || path.startsWith("//")) return "/play";
  // Signing in only to be sent back to sign in is a loop.
  if (path.startsWith("/sign-in") || path.startsWith("/sign-up")) return "/play";
  return path;
}
