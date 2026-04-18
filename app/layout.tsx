import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { auth, isAuthConfigured } from "@/lib/auth";
import InstallPrompt from "@/components/InstallPrompt";
import DemoSessionProvider from "@/components/DemoSessionProvider";
import DemoBanner from "@/components/DemoBanner";
import { RecordingBadge } from "@/components/RecordingBadge";
import { TranscriptionProvider } from "@/contexts/TranscriptionContext";
import { UserProfileProvider } from "@/contexts/UserProfileContext";
import { OnboardingGate } from "@/components/OnboardingGate";
import { OrphanRecordingBanner } from "@/components/OrphanRecordingBanner";

// Noto Sans covers all six UN languages (English, French, Spanish, Russian,
// Arabic, Chinese) plus Hindi — the practical baseline for an ITU tool.
const notoSans = Noto_Sans({
  subsets: ["latin", "latin-ext", "cyrillic", "devanagari"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansMono = Noto_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-noto-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dhvani ध्वनि — Real-time meeting transcription",
  description:
    "Multilingual meeting transcription for the ITU Innovation Hub. Captures Zoom, Teams, and Google Meet audio and transcribes with Azure OpenAI GPT-4o Transcribe.",
  applicationName: "Dhvani",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-152.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dhvani",
  },
  openGraph: {
    title: "Dhvani — Real-time meeting transcription",
    description: "Multilingual meeting transcription, by the ITU Innovation Hub.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#009CD6",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemoClientMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  // Prime the client SessionProvider with the server-resolved session so
  // the first paint already knows who the user is (no flash of signed-out
  // state on slow networks). Skip entirely when SSO isn't configured — the
  // provider would just resolve to null and emit spurious warnings.
  const session = !isDemoClientMode && isAuthConfigured() ? await auth() : null;
  return (
    <html
      lang="en"
      data-theme="light"
      style={{ colorScheme: "light" }}
      className={`${notoSans.variable} ${notoSansMono.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#009CD6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Dhvani" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        {/* Pre-paint theme: avoids the flash of light theme for users
            who picked dark or whose system is dark. Mirrors lib/themeMode.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k=localStorage.getItem('dhvani-theme');var t=k==='dark'||k==='light'?k:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="min-h-screen bg-white text-dark-navy antialiased font-sans"
        style={{ fontFamily: "var(--font-noto-sans), 'Noto Sans', sans-serif" }}
      >
        <div style={{ height: 3, background: "#009CD6", width: "100%" }} />
        {isDemoClientMode ? (
          <DemoSessionProvider>
            <UserProfileProvider>
              <TranscriptionProvider>
                <DemoBanner />
                {children}
                <RecordingBadge />
                <OnboardingGate />
                <OrphanRecordingBanner />
                <InstallPrompt />
              </TranscriptionProvider>
            </UserProfileProvider>
          </DemoSessionProvider>
        ) : (
          <SessionProvider session={session}>
            <UserProfileProvider>
              <TranscriptionProvider>
                {children}
                <RecordingBadge />
                <OnboardingGate />
                <OrphanRecordingBanner />
                <InstallPrompt />
              </TranscriptionProvider>
            </UserProfileProvider>
          </SessionProvider>
        )}
        <script
          // PWA service worker management.
          //
          // Production: register the SW so offline + install work.
          // Dev: actively UNREGISTER any SW + wipe its caches. Dev
          // builds change webpack chunk hashes on every restart, but
          // the SW's cache-first strategy for /_next/* keeps serving
          // stale chunks across hard refreshes and incognito windows —
          // which surfaces as a "Cannot read properties of undefined
          // (reading 'call')" webpack factory error.
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (!('serviceWorker' in navigator)) return;
                var IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
                if (IS_DEV) {
                  navigator.serviceWorker.getRegistrations().then(function (regs) {
                    for (var i = 0; i < regs.length; i++) regs[i].unregister();
                  }).catch(function () {});
                  if (window.caches) {
                    caches.keys().then(function (names) {
                      for (var j = 0; j < names.length; j++) caches.delete(names[j]);
                    }).catch(function () {});
                  }
                  return;
                }
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              })();
            `,
          }}
        />
      </body>
    </html>
  );
}
