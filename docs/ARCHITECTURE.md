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

## Intent-routed transcription

As of 2026-04-20 the home page is an **intent picker** (what are
you trying to capture?), not a raw audio-source picker. Intent +
privacy drive engine selection:

| Intent                          | Privacy     | Engine                                      | Speaker ids |
|---                              |---          |---                                          |---          |
| Solo notes (voice memo)         | on-device   | Local Whisper (`lib/localWhisper.ts`)       | Hard S1     |
| In-person conversation          | on-device   | Local Whisper + local diarizer              | Voice-embedding clustering (`lib/localDiarizer.ts`) |
| In-person conversation          | cloud       | Azure `gpt-4o-transcribe-diarize`           | Voice-embedding stitcher (`lib/embeddingStitcher.ts`) |
| Online meeting (tab/system)     | cloud only* | Azure `gpt-4o-transcribe-diarize`           | Voice-embedding stitcher                   |

*Local diarization of tab-audio / system-audio is a future build;
until then `online-meeting` always uses cloud.

### Routing

`hooks/useTranscription.ts` keeps intent + privacy on refs and
reads them on every chunk. `sendOne` branches to either:

- `sendOneLocal` — decodes the chunk Blob to 16 kHz mono PCM,
  runs Whisper in-browser, optionally runs local diarization
  (`lib/localDiarizer.ts` — slices PCM by Whisper timestamps,
  embeds each slice, clusters via the shared `EmbeddingStitcher`
  instance).
- `sendOneRemote` — the existing Azure path.

Either path falls through to the other on failure, so a bad
model download never kills a recording.

### Audio source

`IntentCards` derives `chosenMode` from the selected intent:
- `solo-notes` / `in-person` → `microphone`
- `online-meeting` → `electron` (if inside the Electron wrapper)
  or `tab-audio` (browser)

The underlying `useAudioCapture` hook is unchanged — it still
takes a `CaptureMode` and doesn't know about intent.

### Cost accounting

`tx.totalMinutes` tracks cloud minutes (billed). `tx.localMinutes`
tracks on-device minutes (zero cost). The ControlBar renders
either "$0.012 (2.0 min)" (all cloud), "$0 · 4.2 min local"
(all local), or "$0.012 · 2.0 cloud + 4.2 local min" (mixed).

### Future: native whisper.cpp for Electron

The current local path uses `@xenova/transformers` (onnxruntime-web
in a WASM backend). A native whisper.cpp binary shipped with the
Electron build would be ~3-5× faster and skip the ~140 MB model
download. Same `TranscriptionResult` contract, so the swap is a
branch in `lib/localWhisper.ts` on `window.electronAPI?.isElectron`.
See Deferred work below.

### Future: re-process with cloud

Intent = in-person + privacy = on-device will want a "re-process
with cloud for higher accuracy" workflow later. Shape:
  1. Keep audio chunks in OPFS after transcription (don't delete
     on successful transcribe).
  2. On the saved-transcript detail page, offer a "Re-process
     with cloud" action that re-uploads via the existing
     `/api/transcribe` route and replaces the transcript in
     place.
  3. Encryption at rest for retained audio (nice-to-have;
     OPFS is origin-scoped but not encrypted).

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

`electron/main.ts` opens a single `BrowserWindow` pointed at the
central server (`https://dhvani.itu.int` by default, or
`DHVANI_SERVER_URL` / `build-config.json` for internal-beta overrides).
No local server, no bundled credentials — users sign in with their
ITU Microsoft account. Installer is ~50 MB.

## Auth (`lib/auth.ts`, `middleware.ts`)

Two modes, controlled by env:
1. **SSO** — `AZURE_AD_CLIENT_SECRET` set. NextAuth + Microsoft Entra.
   This is the production path for `dhvani.itu.int`.
2. **Local no-auth** — secret unset. Synthetic `LOCAL_USER` is
   returned from `getActiveUser()` and middleware passes through.
   Intended for local `next dev` only; a loud console warning fires
   on startup.

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

## Deferred provider work

The following interfaces are scoped but not yet implemented. Add them
when horizontal integration needs them — not before:
- Calendar (`microsoft-calendar`, future `google`)
- Storage (`filesystem` exists, future `azure-blob`, `sharepoint`,
  `supabase`)
- Auth provider wrapper (current `lib/auth.ts` already encapsulates
  this; wrapper would add indirection without value until a second
  auth backend lands)
- Export (current `lib/exportUtils.ts` suffices until a non-file
  target like SharePoint lands)
- API versioning (`/api/v1/…`) — breaking change for extension/
  Electron clients, do in a coordinated release
- **Native whisper.cpp for Electron** — bundle a per-platform
  (macOS arm64/x64, Windows x64, Linux x64) whisper.cpp binary with
  electron-builder; Electron main process spawns it on local-mode
  chunks and exposes a renderer IPC. ~3-5× faster than the current
  WASM path and shrinks the per-recording model load from ~140 MB
  to whatever model file ships with the app. Same `TranscriptionResult`
  shape, so `lib/localWhisper.ts` would just branch on
  `window.electronAPI?.isElectron` and call the IPC.

## Adding a new AI provider

1. Implement `AIProvider` from `lib/providers/ai.ts`.
2. Add `case "your-name": return new YourProvider();` to
   `lib/providers/index.ts#getAIProvider`.
3. `AI_PROVIDER=your-name` in env.
4. No route or component code changes.
