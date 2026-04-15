import { signIn } from "@/lib/auth";

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
  const callbackUrl = searchParams?.callbackUrl || "/";
  const error = searchParams?.error;

  async function doSignIn() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-navy text-white">
      <div className="max-w-md w-full bg-navy-light/60 border border-white/10 rounded-2xl p-8 text-center shadow-xl">
        <div className="flex items-baseline justify-center gap-2 mb-2">
          <h1 className="text-3xl font-bold">Dhvani</h1>
          <span className="text-white/50 text-base">ध्वनि</span>
        </div>
        <p className="text-white/70 mb-6">
          Your organization&apos;s meeting transcription service. Sign in with
          your work account to get started.
        </p>

        <form action={doSignIn}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 bg-white text-[#2f2f2f] font-medium px-4 py-3 rounded-lg hover:bg-white/90 transition-colors"
          >
            <MicrosoftLogo />
            Sign in with Microsoft
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {errorMessage(error)}
          </p>
        )}

        <p className="mt-8 text-xs text-white/40">
          By signing in you agree to use Dhvani in accordance with your
          organization&apos;s acceptable use policies. Audio is sent to your
          organization&apos;s Azure OpenAI transcription deployment
          (with speaker diarization) and not stored by Dhvani.
        </p>
      </div>
    </main>
  );
}

function MicrosoftLogo() {
  return (
    <svg width={18} height={18} viewBox="0 0 23 23" aria-hidden="true">
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
