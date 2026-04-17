import { redirect } from "next/navigation";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import { loadStats } from "@/lib/usageAggregates";
import { AdminDashboardClient } from "./Client";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard page.
 *
 * Server-side authorization:
 *   - Require a signed-in session (middleware enforces this globally).
 *   - Require the email to match ADMIN_EMAILS. Non-admins get a 403
 *     page rather than a redirect so the denial is visible.
 *
 * Data is fetched server-side (filesystem usage log) and handed to the
 * client component as a plain object. The client handles interactivity
 * (sorting, the rate-limit editor, charts).
 */
export default async function AdminPage() {
  // Demo mode: the dashboard is open so the Green ICT and Org
  // Intelligence tabs are explorable without SSO. Production blocks
  // non-admins below.
  if (isDemoMode) {
    const stats = await loadStats();
    return (
      <AdminDashboardClient
        initialStats={stats}
        signedInEmail="demo@itu.int"
      />
    );
  }

  if (!isAuthConfigured()) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 pt-10 bg-off-white">
        <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold mb-2 text-dark-navy">
            Admin disabled
          </h1>
          <p className="text-mid-gray text-sm">
            Single sign-on is not configured, so the admin dashboard is
            disabled. Set <code className="text-dark-navy">AZURE_AD_CLIENT_SECRET</code>{" "}
            and related Entra ID variables to enable it.
          </p>
          <a
            href="/"
            className="inline-block mt-5 px-4 py-2 text-sm text-itu-blue-dark border border-itu-blue/40 rounded hover:bg-itu-blue-pale"
          >
            ← Back to Dhvani
          </a>
        </div>
      </main>
    );
  }

  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    redirect("/auth/signin?callbackUrl=%2Fadmin");
  }
  if (!isAdminEmail(email)) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 pt-10 bg-off-white">
        <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold mb-2 text-dark-navy">
            403 — Forbidden
          </h1>
          <p className="text-mid-gray text-sm">
            Your account (<code className="text-dark-navy">{email}</code>) is
            not authorized to view the Dhvani admin dashboard.
          </p>
          <a
            href="/"
            className="inline-block mt-5 px-4 py-2 text-sm text-itu-blue-dark border border-itu-blue/40 rounded hover:bg-itu-blue-pale"
          >
            ← Back to Dhvani
          </a>
        </div>
      </main>
    );
  }

  const stats = await loadStats();
  return <AdminDashboardClient initialStats={stats} signedInEmail={email} />;
}
