# Deployment

Dhvani has two independent distribution surfaces. Users should never
need to configure environment variables or API keys on their own
machines — secrets live on the server (web app) or in the builder's
shell (demo DMG only).

## 1. Web app — `https://dhvani.itu.int`

One-time server setup. After this, every ITU staff member just opens
the URL, signs in with their ITU account, and has full access.

### Azure Web App configuration

In the Azure Portal → `app-dhvani` → Configuration → Application
Settings, add:

```
# Transcription (Sweden Central — low-carbon grid)
AZURE_OPENAI_API_KEY=<swc data-plane key>
AZURE_OPENAI_ENDPOINT=https://z-oai-innovationhub-dev-swc.openai.azure.com/
AZURE_OPENAI_WHISPER_DEPLOYMENT=gpt-4o-transcribe-diarize
AZURE_OPENAI_API_VERSION=2025-03-01-preview

# Chat (West Europe — where gpt-4.1-mini is deployed)
AZURE_OPENAI_CHAT_API_KEY=<euw data-plane key>
AZURE_OPENAI_CHAT_ENDPOINT=https://z-oai-innovationhub-dev-euw.openai.azure.com/
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_CHAT_API_VERSION=2024-12-01-preview

# Microsoft Entra SSO (from Entra App Registration)
AZURE_AD_CLIENT_ID=<client id>
AZURE_AD_CLIENT_SECRET=<client secret>
AZURE_AD_TENANT_ID=<ITU tenant id>
NEXTAUTH_SECRET=<output of: openssl rand -base64 32>
NEXTAUTH_URL=https://dhvani.itu.int

# Admin allow-list (comma-separated)
ADMIN_EMAILS=rahul.jha@itu.int

# Optional: webhook for Teams/Slack/Zapier event stream
# NOTIFICATION_WEBHOOK_URL=https://…
```

Rotating a key is a single-config update in the portal — no user
action required.

### Build & deploy

```bash
npm ci
npm run build
# Next handles SSR + /api routes on the Web App's bundled Node runtime.
```

`next.config.mjs` uses `output: "standalone"`, so the Azure deploy only
needs the `.next/standalone`, `.next/static`, and `public/` directories.

### Security posture

- **No API keys ever reach the browser.** Every AI call happens in
  server-side route handlers under `app/api/`; keys live only in
  `process.env` on the Web App host. Verified: `grep -r AZURE_OPENAI
  components/ hooks/` returns zero matches.
- Middleware enforces SSO on every protected route.
- `/api/transcribe` self-authenticates via session cookie or
  `x-auth-token` (Chrome extension) so a stolen extension bundle can't
  spoof identity without the signed JWT.

## 2. Electron desktop app — normal (production) build

The desktop app is a thin browser window that loads the central web
app. No local server, no API keys, no setup — users install, sign in,
done.

```bash
npm run electron:build:mac   # DMG (~50 MB)
npm run electron:build:win   # NSIS installer
```

Override the target URL at build time if the app should point at a
different host:

```bash
DHVANI_SERVER_URL=https://dhvani-stage.itu.int npm run electron:build:mac
```

Distribute via Intune / SCCM / signed download page. Users:

1. Install Dhvani.
2. Launch it.
3. Sign in with Microsoft.
4. Done.

## 3. Electron demo build — for offline conference demos

Bundles the Next.js standalone server and forks it locally on port
`38447`. **API keys are baked in from the builder's shell
environment** — do not distribute the resulting DMG publicly.

```bash
# Set the keys in your shell first:
export AZURE_OPENAI_API_KEY=…
export AZURE_OPENAI_ENDPOINT=https://…/
export AZURE_OPENAI_CHAT_API_KEY=…
export AZURE_OPENAI_CHAT_ENDPOINT=https://…/
export AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4.1-mini

npm run electron:build:demo   # DMG (~170 MB)
```

The demo build starts `DEMO_MODE=true` so SSO is bypassed and
`DEMO_USER` is used for all routes.

## Feature toggles (optional, both modes)

Each flag defaults on; setting it to `false` disables the feature
without touching code:

```
FEATURE_SUMMARY=false
FEATURE_ASK_AI=false
FEATURE_CALENDAR=false
FEATURE_UPLOAD=false
FEATURE_SHARING=false
```

## Provider overrides (optional)

Implementations in `lib/providers/`. See `docs/ARCHITECTURE.md`.

```
AI_PROVIDER=azure-openai      # future: google-gemini, anthropic, local-whisper
CALENDAR_PROVIDER=microsoft   # future: google
STORAGE_PROVIDER=filesystem   # future: azure-blob, sharepoint, supabase
AUTH_PROVIDER=microsoft-entra # future: google, okta
```
