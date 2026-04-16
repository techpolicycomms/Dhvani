import { signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demoMode";

export const dynamic = "force-dynamic";

/**
 * Branded sign-in landing page.
 *
 * A single button kicks off the Microsoft Entra ID OAuth flow via a
 * server action. Because Dhvani is an org-only deployment, we don't
 * show any other identity providers.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string; error?: string };
}) {
  if (isDemoMode) {
    redirect("/");
  }
  const callbackUrl = searchParams?.callbackUrl || "/";
  const error = searchParams?.error;

  async function doSignIn() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 pt-10 bg-off-white">
      <div className="max-w-[400px] w-full bg-white border border-border-gray rounded-lg p-8 text-center shadow-sm">
        <div className="flex items-baseline justify-center gap-2 mb-1">
          <h1 className="text-3xl font-bold text-dark-navy">Dhvani</h1>
          <span className="text-mid-gray text-base">ध्वनि</span>
        </div>
        <p className="text-itu-blue-dark text-xs font-medium mb-1">
          International Telecommunication Union
        </p>
        <p className="text-mid-gray mb-6 text-sm">
          Meeting transcription for the ITU. Sign in with your work account to
          get started.
        </p>

        <form action={doSignIn}>
          <button
            type="submit"
            className="w-full h-11 flex items-center justify-center gap-3 bg-itu-blue text-white font-medium px-4 rounded-lg hover:bg-itu-blue-dark transition-colors"
          >
            <MicrosoftLogo />
            Sign in with your ITU account
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-error" role="alert">
            {errorMessage(error)}
          </p>
        )}

        <p className="mt-8 text-[11px] text-mid-gray">
          Audio is sent to your organization&apos;s Azure OpenAI transcription
          deployment (with speaker diarization) and not stored by Dhvani.
        </p>

        <p className="mt-4 text-[11px] text-mid-gray">
          An ITU Innovation Hub tool.
        </p>
      </div>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg width={16} height={16} viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "OAuthSignin":
    case "OAuthCallback":
      return "Microsoft sign-in failed. Please try again.";
    case "AccessDenied":
      return "Access denied. Your account isn't permitted to use Dhvani.";
    case "Configuration":
      return "Dhvani is not configured correctly. Contact your administrator.";
    default:
      return "Sign-in error. Please try again or contact your administrator.";
  }
}
