import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { auth, isAuthConfigured } from "@/lib/auth";
import InstallPrompt from "@/components/InstallPrompt";

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
  themeColor: "#1DA0DB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Prime the client SessionProvider with the server-resolved session so
  // the first paint already knows who the user is (no flash of signed-out
  // state on slow networks). Skip entirely when SSO isn't configured — the
  // provider would just resolve to null and emit spurious warnings.
  const session = isAuthConfigured() ? await auth() : null;
  return (
    <html
      lang="en"
      data-theme="light"
      style={{ colorScheme: "light" }}
      className={`${notoSans.variable} ${notoSansMono.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1DA0DB" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Dhvani" />
        <link rel="apple-touch-icon" href="/icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-white text-dark-navy antialiased font-sans">
        {/* 3-px ITU Blue accent line at the top of every page. */}
        <div
          aria-hidden="true"
          className="fixed top-0 left-0 right-0 h-[3px] bg-itu-blue z-50"
        />
        <SessionProvider session={session}>
          {children}
          <InstallPrompt />
        </SessionProvider>
        <script
          // Register the PWA service worker on supported browsers.
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(){});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
