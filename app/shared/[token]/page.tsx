import { notFound } from "next/navigation";
import { getShare } from "@/lib/shareStorage";
import { getTranscript } from "@/lib/transcriptStorage";
import { auth, isAuthConfigured } from "@/lib/auth";
import SharedTranscriptView from "./SharedTranscriptView";

export const dynamic = "force-dynamic";

export default async function SharedPage({
  params,
}: {
  params: { token: string };
}) {
  const share = await getShare(params.token);
  if (!share) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-off-white">
        <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-8 text-center">
          <h1 className="text-xl font-semibold text-dark-navy mb-2">Link expired</h1>
          <p className="text-sm text-mid-gray">
            This shared transcript link has expired or does not exist.
          </p>
        </div>
      </main>
    );
  }

  if (share.requireAuth && isAuthConfigured()) {
    const session = await auth();
    if (!session?.user?.email) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6 bg-off-white">
          <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-8 text-center">
            <h1 className="text-xl font-semibold text-dark-navy mb-2">Sign in required</h1>
            <p className="text-sm text-mid-gray mb-4">
              This transcript requires authentication to view.
            </p>
            <a
              href={`/auth/signin?callbackUrl=/shared/${params.token}`}
              className="inline-block px-5 py-2 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark text-sm font-medium"
            >
              Sign in
            </a>
          </div>
        </main>
      );
    }
  }

  const transcript = await getTranscript(share.userId, share.transcriptId);
  if (!transcript) {
    notFound();
  }

  return (
    <SharedTranscriptView
      transcript={{
        title: transcript.title,
        startedAt: transcript.startedAt,
        endedAt: transcript.endedAt,
        durationMinutes: transcript.durationMinutes,
        entries: transcript.entries,
        speakerNames: transcript.speakerNames,
        summary: transcript.summary,
        actionItems: transcript.actionItems,
        meeting: transcript.meeting,
      }}
    />
  );
}
