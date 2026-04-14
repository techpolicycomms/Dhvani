import type { Metadata, Viewport } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Dhvani ध्वनि — Real-time meeting transcription",
  description:
    "Open-source multilingual meeting transcription for everyone. Captures Zoom, Teams, and Google Meet audio and transcribes with OpenAI Whisper.",
  applicationName: "Dhvani",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dhvani",
  },
  openGraph: {
    title: "Dhvani — Real-time meeting transcription",
    description: "Open-source multilingual meeting transcription.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
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
  // state on slow networks).
  const session = await auth();
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-navy text-white antialiased">
        <SessionProvider session={session}>{children}</SessionProvider>
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
