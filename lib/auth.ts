import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";

/**
 * In-process refresh-attempt deduper. If two parallel requests both find an
 * expired token, only one of them should hit Microsoft's /token endpoint.
 * Subsequent calls await the same in-flight promise.
 */
const refreshInFlight = new Map<string, Promise<string | null>>();

/**
 * NextAuth v5 (Auth.js) configuration for Dhvani.
 *
 * Dhvani is deployed as a single-tenant, org-wide service. Authentication
 * is handled by Microsoft Entra ID (Azure AD). The configured tenant
 * restricts access to a single directory — only members of the host org
 * can sign in.
 *
 * Session strategy is JWT so we don't need to provision a database; the
 * token includes the user's email, name, and Entra object ID (`oid`),
 * which we use as the stable userId for usage tracking and rate
 * limiting.
 *
 * Required env vars:
 *   AZURE_AD_CLIENT_ID      — from Azure App Registration
 *   AZURE_AD_CLIENT_SECRET  — from Azure App Registration
 *   AZURE_AD_TENANT_ID      — the org's Entra tenant ID
 *   NEXTAUTH_SECRET         — random secret for signing session tokens
 *   NEXTAUTH_URL            — public origin (e.g. https://dhvani.itu.int)
 *
 * The provider also requests `Calendars.Read` so the /api/calendar/* routes
 * can call Microsoft Graph on the user's behalf. Admin consent for this
 * scope must be granted in the Entra App Registration.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      // In v5 the provider uses `issuer` for the tenant URL.
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
      authorization: {
        params: {
          scope:
            "openid profile email offline_access User.Read Calendars.Read",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Shorter than NextAuth's 30-day default — staff re-auth daily so a
    // stolen cookie has limited lifespan. Refresh token rotation keeps
    // Graph calls working without user interaction within the window.
    maxAge: 24 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    // Only allow redirects to our own origin. NextAuth v5 is already
    // same-origin by default, but we pin it explicitly so a crafted
    // `callbackUrl` query can't bounce users to an attacker-controlled
    // host on an open-redirect chain.
    async redirect({ url, baseUrl }) {
      try {
        const u = new URL(url, baseUrl);
        if (u.origin === baseUrl) return u.toString();
      } catch {
        /* fall through */
      }
      return baseUrl;
    },
    async jwt({ token, profile, account }) {
      // On first sign-in, copy identity claims into the JWT so subsequent
      // requests don't need to hit the /userinfo endpoint.
      if (account && profile) {
        const p = profile as {
          oid?: string;
          sub?: string;
          email?: string;
          preferred_username?: string;
          name?: string;
          department?: string;
          jobTitle?: string;
        };
        token.userId = p.oid || p.sub || token.sub || "";
        token.email = p.email || p.preferred_username || token.email || "";
        token.name = p.name || token.name || "";
        // Org Intelligence tab uses this (if present) to group anonymised
        // meeting records by department. Entra populates it from the
        // tenant's user directory; absent for personal accounts.
        if (p.department) token.department = p.department;
      }
      // Persist the Microsoft access token + refresh token + expiry so
      // server-side calls to Microsoft Graph (calendar) can authenticate
      // as the user. The refresh token (granted by `offline_access`) is
      // used to mint a new access token on demand from
      // `getGraphAccessToken()`; the JWT only carries the *current*
      // values and is rewritten when we refresh.
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) || session.user.email || "";
        session.user.name = (token.name as string) || session.user.name || null;
        // Expose our app-specific identity fields on session.user.
        (session.user as { userId?: string }).userId =
          (token.userId as string) || "";
        (session.user as { department?: string }).department =
          (token.department as string) || undefined;
      }
      // NOTE: we deliberately do NOT surface the Microsoft Graph access
      // token here. NextAuth's SessionProvider serializes the session
      // object into the HTML for the browser, so anything attached to it
      // is reachable from client JS. The Graph token stays inside the
      // signed JWT cookie and is only readable server-side via
      // `getGraphAccessToken()` below.
      //
      // We do surface a boolean so the client can short-circuit calls to
      // calendar routes when no token was ever captured.
      (session as { hasGraphToken?: boolean }).hasGraphToken = Boolean(
        token.accessToken
      );
      return session;
    },
  },
  trustHost: true,
};

// Export the v5 auth helpers. `auth` is used everywhere we need a session
// (server components, API routes, middleware). `handlers` is re-exported
// by app/api/auth/[...nextauth]/route.ts.
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * Is single-sign-on configured in this environment?
 *
 * We gate on `AZURE_AD_CLIENT_SECRET` specifically — the OIDC flow
 * cannot complete without it, and the other AZURE_AD_* vars happen to
 * be present in some CI/build images. Missing secret → run in no-auth
 * mode: middleware opens up, API routes use a synthetic local user.
 *
 * This is an *escape hatch for local dev and demo deployments*. As soon
 * as the secret is set, all routes go back to full SSO with zero code
 * changes — nothing here is feature-flagged in the usual sense.
 */
export function isAuthConfigured(): boolean {
  return Boolean(process.env.AZURE_AD_CLIENT_SECRET);
}

// Emit the warning exactly once per process so it's loud on startup but
// doesn't spam per request. Wrapped in a module-local guard rather than
// relying on side-effecting top-level `if`s, which don't compose well
// with Next.js' dev reloader.
let _warnedNoAuth = false;
function warnNoAuthOnce(): void {
  if (_warnedNoAuth || isAuthConfigured()) return;
  _warnedNoAuth = true;
  // eslint-disable-next-line no-console
  console.warn(
    "WARNING: SSO not configured — running without authentication"
  );
}
// Fire on first import so `npm start` / `next dev` logs the banner.
warnNoAuthOnce();

export type ActiveUser = {
  userId: string;
  email: string;
  name: string | null;
  department?: string;
};

/**
 * The synthetic user presented to API routes when SSO is disabled.
 * Stable userId so per-user state (quota counters, transcript folder)
 * remains coherent across restarts.
 */
const LOCAL_USER: ActiveUser = {
  userId: "local-user",
  email: "local@dhvani.local",
  name: "Local user",
};

/**
 * The common "who's calling?" accessor for API routes.
 *
 * - If SSO is configured, reads the NextAuth session and returns the
 *   Entra-backed user, or null when unauthenticated.
 * - If SSO is NOT configured, returns a stable synthetic user so the
 *   feature surface still works for local/demo use.
 *
 * Routes that need to hard-deny (admin dashboard, etc.) should check
 * `isAuthConfigured()` themselves and refuse in no-auth mode.
 */
export async function getActiveUser(): Promise<ActiveUser | null> {
  if (!isAuthConfigured()) {
    warnNoAuthOnce();
    return LOCAL_USER;
  }
  const session = await auth();
  const user = session?.user as
    | {
        userId?: string;
        email?: string | null;
        name?: string | null;
        department?: string;
      }
    | undefined;
  if (!user?.email) return null;
  return {
    userId: user.userId || user.email,
    email: user.email,
    name: user.name || null,
    department: user.department,
  };
}

/**
 * Resolve the active user from an incoming request, accepting either:
 *
 *   (a) the NextAuth session cookie — the default web-app path, or
 *   (b) an `x-auth-token` header carrying the same raw session token
 *       (used by the Chrome extension, where cross-origin cookies are
 *       sometimes dropped by Chrome even with credentials:include)
 *
 * Falls back to the synthetic local user in no-auth mode.
 *
 * The x-auth-token value must be the literal NextAuth JWT captured from
 * a signed-in session's cookie. We re-verify it against NEXTAUTH_SECRET
 * via `getToken()` so a forged or tampered header can't spoof identity.
 */
export async function resolveRequestUser(
  req: Request
): Promise<ActiveUser | null> {
  if (!isAuthConfigured()) {
    warnNoAuthOnce();
    return LOCAL_USER;
  }

  const header = req.headers.get("x-auth-token");
  const secret = process.env.NEXTAUTH_SECRET;
  if (header && secret) {
    // NextAuth's JWT decoder uses the cookie name as the salt. Production
    // (https) uses `__Secure-authjs.session-token`; dev/http uses the
    // un-prefixed variant. Try both so the extension works against either.
    for (const salt of [
      "__Secure-authjs.session-token",
      "authjs.session-token",
    ]) {
      try {
        const decoded = (await getToken({
          req: {
            headers: { cookie: `${salt}=${header}` },
          } as never,
          secret,
          salt,
        })) as
          | { userId?: string; email?: string; name?: string | null }
          | null;
        if (decoded?.email) {
          return {
            userId: decoded.userId || decoded.email,
            email: decoded.email,
            name: decoded.name || null,
          };
        }
      } catch {
        /* try the other salt */
      }
    }
  }

  // Cookie-based path — same as getActiveUser().
  return getActiveUser();
}

/**
 * Server-only Graph access-token reader.
 *
 * Reads the JWT from the request cookie (NOT from the public session
 * payload, which deliberately omits the token) and refreshes it via the
 * stored refresh token if it expires within the next 60 seconds.
 *
 * Returns `null` if the user is signed out, has no Graph token, or the
 * refresh attempt failed. Calendar routes treat that as "no token" and
 * degrade to an empty agenda.
 *
 * Concurrency: if multiple requests find the same expired token at once
 * we coalesce them through `refreshInFlight` so only one /token call hits
 * Microsoft.
 */
export async function getGraphAccessToken(): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  // next-auth/jwt requires the request cookies; in route handlers and
  // server components we have access via next/headers.
  const cookieStore = await cookies();
  // getToken accepts either a NextRequest or a `req`-shaped cookie holder.
  // In v5 it's friendlier to pass a fake req with the cookie header.
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const fakeReq = {
    headers: { cookie: cookieHeader },
  } as unknown as Request;

  const token = (await getToken({
    req: fakeReq as never,
    secret,
    salt: cookieStore.get("__Secure-authjs.session-token")
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  })) as
    | {
        accessToken?: string;
        refreshToken?: string;
        accessTokenExpires?: number;
        userId?: string;
      }
    | null;

  if (!token?.accessToken) return null;

  const expires = token.accessTokenExpires || 0;
  if (expires - Date.now() > 60_000) {
    return token.accessToken;
  }

  // Token is expired or about to expire — try to refresh.
  if (!token.refreshToken) return null;
  const key = token.userId || token.refreshToken;
  let pending = refreshInFlight.get(key);
  if (!pending) {
    pending = refreshGraphToken(token.refreshToken).finally(() => {
      // Clear the inflight slot shortly after so subsequent expiries can
      // refresh again.
      setTimeout(() => refreshInFlight.delete(key), 1000);
    });
    refreshInFlight.set(key, pending);
  }
  return pending;
}

/**
 * Exchange a refresh token for a new access token at Microsoft's
 * tenant-scoped /token endpoint. Returns the new access token or null on
 * failure (network error, refresh token revoked, scope removed).
 *
 * NOTE: this does NOT rewrite the JWT cookie — Next.js doesn't expose
 * that mid-request from inside an arbitrary route handler. The fresh
 * token lives only in memory for this request; the next request will
 * re-refresh until the user signs in again. That's fine for a calendar
 * fetch (cheap) and avoids a tricky cookie write race.
 */
async function refreshGraphToken(
  refreshToken: string
): Promise<string | null> {
  const tenant = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) return null;

  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          scope: "openid profile email offline_access User.Read Calendars.Read",
        }),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string };
    return body.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Check whether an email address is on the admin allowlist.
 *
 * ADMIN_EMAILS is a comma-separated env var — e.g.
 *   ADMIN_EMAILS=rahul.jha@itu.int,it-admin@itu.int
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
