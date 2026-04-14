import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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
 */
export default auth((req) => {
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
