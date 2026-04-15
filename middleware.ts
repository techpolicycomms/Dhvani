import { NextResponse } from "next/server";
import { auth, isAuthConfigured } from "@/lib/auth";

// Public route prefixes — no session required. Everything else is locked
// behind Microsoft SSO.
const PUBLIC_PREFIXES = [
  "/auth",                 // sign-in page + callback UI
  "/api/auth",             // NextAuth handlers (callbacks, csrf, etc.)
  "/api/health",           // Key-validation endpoint for monitoring
  "/_next",                // Next.js internals
  "/manifest.json",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p)
  );
}

/**
 * Global auth gate.
 *
 * Uses NextAuth v5's `auth` wrapper, which injects the session into
 * `req.auth`. Unauthenticated users hitting a protected page are bounced
 * to /auth/signin; unauthenticated API calls get a 401 JSON response.
 *
 * If SSO is not configured (no `AZURE_AD_CLIENT_SECRET` in env), the
 * gate is disabled wholesale — routes fall back to a synthetic local
 * user via `getActiveUser()`. This is for local/demo use only; `lib/auth.ts`
 * prints a loud console warning on startup in that mode.
 */
export default auth((req) => {
  // Escape hatch for local/demo: if the client secret isn't set, let
  // everything through. All the auth machinery is still loaded so the
  // moment the secret reappears in env, this flips back to gated.
  if (!isAuthConfigured()) return;

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return;

  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }
    const signIn = new URL("/auth/signin", req.nextUrl);
    signIn.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signIn);
  }
});

export const config = {
  // Match everything, but skip static files by extension to keep the
  // middleware cheap. The isPublic() check inside the handler still
  // allows /manifest.json, /sw.js, etc.
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
