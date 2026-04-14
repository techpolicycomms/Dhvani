import { redirect } from "next/navigation";
import { auth, isAdminEmail } from "@/lib/auth";
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
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    redirect("/auth/signin?callbackUrl=%2Fadmin");
  }
  if (!isAdminEmail(email)) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-navy-light/60 border border-white/10 rounded-lg p-6 text-center">
          <h1 className="text-xl font-semibold mb-2">403 — Forbidden</h1>
          <p className="text-white/70 text-sm">
            Your account (<code>{email}</code>) is not authorized to view the
            Dhvani admin dashboard.
          </p>
          <a
            href="/"
            className="inline-block mt-5 px-4 py-2 text-sm text-teal border border-teal/30 rounded hover:bg-teal/10"
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
