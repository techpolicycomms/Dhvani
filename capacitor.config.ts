import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrapper for the Dhvani Next.js app.
 *
 * Dhvani relies on server-side API routes (`/api/transcribe`,
 * NextAuth, etc.), so we can't just bundle a static export into the
 * native shell — the WebView has to point at a live Next.js server.
 * Two modes:
 *
 *   - **Dev** (default during local testing): point at your laptop
 *     on the same wifi as the phone, e.g. `DHVANI_MOBILE_SERVER_URL
 *     =http://192.168.1.42:3000`. Phone must be on the same subnet.
 *     For remote dev, use ngrok / Cloudflare Tunnel and set the
 *     public URL.
 *
 *   - **Prod**: `DHVANI_MOBILE_SERVER_URL=https://dhvani.itu.int`
 *     (or whichever URL the ITU deployment is at). Release builds
 *     should always use https.
 *
 * See docs/MOBILE_DEMO_SETUP.md for the full install + run
 * walkthrough.
 */

const serverUrl =
  process.env.DHVANI_MOBILE_SERVER_URL?.trim() ||
  "https://dhvani.itu.int";

// Allow http:// only when pointing at a LAN dev IP. Never enable
// cleartext against a production URL — the shim is release-blocking
// for App Store / Play Store review.
const isLocalDev = /^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.)/.test(
  serverUrl
);

const config: CapacitorConfig = {
  appId: "int.itu.dhvani",
  appName: "Dhvani",
  webDir: "public",
  // Route WebView loads at the live Dhvani server rather than a
  // bundled static export. The `public/` webDir is only used as the
  // fallback / splash / icons path.
  server: {
    url: serverUrl,
    cleartext: isLocalDev,
    // Allow navigation within the Dhvani origin(s). Block everything
    // else from hijacking the WebView (NextAuth redirects to
    // login.microsoftonline.com still work because they're explicit
    // navigations, not iframe loads).
    allowNavigation: [
      "dhvani.itu.int",
      "*.itu.int",
      "login.microsoftonline.com",
      "login.live.com",
    ],
  },
  ios: {
    // Respect iPhone notch/home-indicator safe areas — we already
    // honour env(safe-area-inset-bottom) on the ControlBar in CSS.
    contentInset: "automatic",
    // Allow getUserMedia permission prompts to surface natively.
    // Info.plist needs NSMicrophoneUsageDescription added in the
    // Xcode project (see docs/MOBILE_DEMO_SETUP.md).
    scheme: "dhvani",
    backgroundColor: "#ffffff",
  },
  android: {
    // Android permissions (RECORD_AUDIO, FOREGROUND_SERVICE) are
    // declared in android/app/src/main/AndroidManifest.xml after
    // `npx cap add android` — see the setup doc.
    backgroundColor: "#ffffff",
    allowMixedContent: isLocalDev,
  },
};

export default config;
