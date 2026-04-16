"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-off-white">
      <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-8 text-center shadow-sm">
        <WifiOff className="mx-auto mb-4 text-mid-gray" size={48} />
        <h1 className="text-xl font-semibold mb-2 text-dark-navy">
          You&apos;re offline
        </h1>
        <p className="text-mid-gray text-sm leading-relaxed mb-4">
          Dhvani needs an internet connection to transcribe audio. Check your
          connection and try again.
        </p>
        <p className="text-mid-gray text-xs leading-relaxed">
          Transcripts you&apos;ve already saved are stored on the server and
          will be available when you reconnect.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2 text-sm font-medium text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
