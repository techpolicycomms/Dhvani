import NextAuth, { type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

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
 */
export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      // In v5 the provider uses `issuer` for the tenant URL.
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
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
        };
        token.userId = p.oid || p.sub || token.sub || "";
        token.email = p.email || p.preferred_username || token.email || "";
        token.name = p.name || token.name || "";
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
      }
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
