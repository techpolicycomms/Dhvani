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
      // 'wasm-unsafe-eval' lets transformers.js / onnxruntime-web
      // load its WASM backend for on-device voice embeddings.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      // huggingface.co hosts the voice-embedding ONNX model that
      // transformers.js downloads on first recording (then caches
      // in IndexedDB). cdn-lfs.* serves the large model weights.
      "connect-src 'self' http://localhost:* https://*.openai.azure.com https://graph.microsoft.com https://login.microsoftonline.com https://huggingface.co https://*.huggingface.co https://cdn-lfs.huggingface.co",
      "worker-src 'self' blob:",
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
  // transformers.js pulls in a handful of Node-only optional
  // dependencies (`sharp` for image preprocessing, `onnxruntime-node`
  // for the Node runtime, `fs`/`path`/etc). Webpack tries to bundle
  // them for the browser and fails on the native `.node` binaries.
  // Stub them out so the client build only uses the browser-safe
  // path (WASM via onnxruntime-web).
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
        os: false,
      };
    }
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Aliasing to `false` tells webpack "this module is a no-op
      // for this build target" — the correct way to express
      // "don't even try to resolve it".
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
