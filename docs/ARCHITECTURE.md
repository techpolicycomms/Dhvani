# Dhvani Architecture

## Provider layer

All horizontal integrations go through a single interface in
`lib/providers/`. Route and component code call a factory — it never
imports a vendor SDK directly. Swapping an integration is:
1. Write a class that implements the provider interface.
2. Add a `case` to the factory.
3. Flip one env var.

### AI (`lib/providers/ai.ts`)
`AIProvider` abstracts transcription + chat. `getAIProvider()` reads
`AI_PROVIDER` (default `azure-openai`).

Current implementations:
- `AzureOpenAIProvider` — wraps `lib/openai.ts` helpers.

Wired into: `app/api/transcribe/route.ts`, `app/api/summarize/route.ts`.

### Events (`lib/events.ts`)
Single in-process `EventBus`. Routes emit domain events
(`transcription.started`, `transcription.completed`, `summary.generated`,
`transcript.shared`, `transcript.exported`). A built-in listener posts
to `NOTIFICATION_WEBHOOK_URL` if configured — the same JSON shape works
for Teams connectors, Slack incoming webhooks, Zapier, and Make.com.

### Config (`lib/config.ts`)
`getConfig()` is the single source of truth for provider selection and
feature toggles. Any feature can be disabled with `FEATURE_X=false`
without touching code.

## Packaged app (Electron)

`electron/main.ts` forks `.next/standalone/server.js` in production
(with `ELECTRON_RUN_AS_NODE=1`) on `127.0.0.1:38447`, polls `/` until
ready, then swaps the BrowserWindow from a splash `data:` URL to the
live server. Demo defaults (`DEMO_MODE=true`, a placeholder
`NEXTAUTH_SECRET`) are injected into the forked child's env so the
DMG works with zero `.env.local`. `asar: false` in the build config is
required because `fork()` cannot execute a script inside an asar
archive.

## Auth (`lib/auth.ts`, `middleware.ts`)

Three modes, controlled by env:
1. **SSO** — `AZURE_AD_CLIENT_SECRET` set. NextAuth + Microsoft Entra.
2. **Local no-auth** — secret unset. Synthetic `LOCAL_USER`.
3. **Demo** — `DEMO_MODE=true`. Middleware short-circuits before the
   NextAuth wrapper runs (avoids `MissingSecret`), routes return
   `DEMO_USER` from `getActiveUser()`.

## Environment variable reference

| Var | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `azure-openai` | Provider class |
| `CALENDAR_PROVIDER` | `microsoft` | Calendar backend (reserved) |
| `STORAGE_PROVIDER` | `filesystem` | Transcript storage (reserved) |
| `AUTH_PROVIDER` | `microsoft-entra` | Auth backend |
| `NOTIFICATION_PROVIDER` | `browser` | Primary notifier |
| `NOTIFICATION_WEBHOOK_URL` | — | Optional generic webhook listener |
| `FEATURE_SUMMARY` | on | `false` disables Generate Summary |
| `FEATURE_ASK_AI` | on | `false` disables Ask Dhvani |
| `FEATURE_CALENDAR` | on | `false` disables calendar panel |
| `FEATURE_UPLOAD` | on | `false` disables upload route |
| `FEATURE_SHARING` | on | `false` disables transcript sharing |
| `AZURE_OPENAI_API_KEY` / `_ENDPOINT` / `_WHISPER_DEPLOYMENT` | — | Transcription |
| `AZURE_OPENAI_CHAT_API_KEY` / `_CHAT_ENDPOINT` / `_CHAT_DEPLOYMENT` | inherits shared | Chat (can live on a different Azure resource) |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | `false` | Force demo mode |

## Deferred provider work

The following interfaces are scoped but not yet implemented. Add them
when horizontal integration needs them — not before:
- Calendar (`microsoft-calendar`, `demo-calendar`, future `google`)
- Storage (`filesystem` exists, future `azure-blob`, `sharepoint`,
  `supabase`)
- Auth provider wrapper (current `lib/auth.ts` already encapsulates
  this; wrapper would add indirection without value until a second
  auth backend lands)
- Export (current `lib/exportUtils.ts` suffices until a non-file
  target like SharePoint lands)
- API versioning (`/api/v1/…`) — breaking change for extension/
  Electron clients, do in a coordinated release

## Adding a new AI provider

1. Implement `AIProvider` from `lib/providers/ai.ts`.
2. Add `case "your-name": return new YourProvider();` to
   `lib/providers/index.ts#getAIProvider`.
3. `AI_PROVIDER=your-name` in env.
4. No route or component code changes.
