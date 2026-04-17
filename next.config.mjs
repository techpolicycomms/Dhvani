// Security response headers applied to every route.
//
// CSP notes:
//   - 'unsafe-inline' + 'unsafe-eval' in script-src are required by
//     Next.js 14's app-router runtime (webpack-eval in dev, nonce-less
//     hydration shims in prod). Tightening further requires nonces on
//     every inline tag — possible but a larger change.
//   - connect-src allows our Azure OpenAI + Microsoft Graph hosts plus
//     the localhost dev server; in production the dev host is ignored.
//   - frame-ancestors 'none' blocks clickjacking.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' http://localhost:* https://*.openai.azure.com https://graph.microsoft.com https://login.microsoftonline.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for the Dockerfile's multi-stage production image.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
