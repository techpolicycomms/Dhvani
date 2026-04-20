# Deployment

Dhvani has two distribution surfaces — the central web app at
`https://dhvani.itu.int` and a thin Electron desktop shell that loads
the same web app. Users never configure secrets locally; they live on
the Azure Web App.

## 1. Web app — `https://dhvani.itu.int`

One-time server setup. After this, every ITU staff member just opens
the URL, signs in with their ITU account, and has full access.

### Provisioning (one-time)

1. **App Service** — Linux, Node 20 LTS:
   ```bash
   az webapp create \
     --resource-group rg-innovation-hub \
     --plan plan-innovation-hub-linux \
     --name app-dhvani \
     --runtime "NODE:20-lts"
   az webapp config set --name app-dhvani \
     --resource-group rg-innovation-hub \
     --startup-file "node server.js"
   ```
   `server.js` is produced by `next build` because
   `next.config.mjs` sets `output: "standalone"`.

2. **Entra App Registration** — Portal → Entra → App registrations:
   - Platform: Web
   - Redirect URI: `https://dhvani.itu.int/api/auth/callback/microsoft-entra-id`
   - Front-channel logout URL: `https://dhvani.itu.int/auth/signin`
   - Generate a client secret — copy it now (one-time view)
   - Note Application (client) ID + Directory (tenant) ID

3. **DNS** — ITU Networks adds a CNAME `dhvani → app-dhvani.azurewebsites.net`
   in the `itu.int` zone. Then in the App Service → Custom domains →
   add `dhvani.itu.int`, verify ownership, bind an App Service
   Managed Certificate (free, auto-renewing).

4. **Persistent data dir** — the container mounts `/app/data` as a
   volume. In the App Service, attach an Azure Files share to that
   path (Configuration → Path mappings → New Azure Storage Mount →
   `/app/data` → Azure Files share) and set `DHVANI_DATA_DIR=/app/data`
   in App Settings. Without this, every container restart/rollout
   wipes transcripts, saved vocabulary, and share tokens.

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

# Persistent write-through directory for transcripts + vocab + shares.
# The container mounts /app/data as a volume (see Dockerfile); attach
# an Azure Files share to that path in App Service → Configuration →
# Path mappings so transcripts survive restarts and multi-instance
# scale-out.
DHVANI_DATA_DIR=/app/data

# Optional: webhook for Teams/Slack/Zapier event stream
# NOTIFICATION_WEBHOOK_URL=https://…
```

Rotating a key is a single-config update in the portal — no user
action required.

### Build & deploy

CI/CD runs automatically on every push to `main` via
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
The workflow builds a Docker image from [`Dockerfile`](../Dockerfile)
(multi-stage, Next.js standalone output, non-root nextjs user),
tags it with the commit SHA + `latest`, pushes to Azure Container
Registry, and rolls the App Service by pointing at the new tag.

Required **GitHub repository secrets** (Settings → Secrets and
variables → Actions):

```
AZURE_CREDENTIALS       # output of:
                        # az ad sp create-for-rbac \
                        #   --name dhvani-deploy \
                        #   --role contributor \
                        #   --scopes /subscriptions/<sub-id>/resourceGroups/rg-innovation-hub \
                        #   --sdk-auth
ACR_LOGIN_SERVER        # e.g. dhvaniacr.azurecr.io
ACR_USERNAME            # ACR access keys → username
ACR_PASSWORD            # ACR access keys → password
AZURE_WEBAPP_NAME       # app-dhvani
AZURE_RESOURCE_GROUP    # rg-innovation-hub
```

The App Service itself must be configured for container-based
deployment:

```bash
az webapp config container set \
  --name app-dhvani \
  --resource-group rg-innovation-hub \
  --docker-custom-image-name dhvaniacr.azurecr.io/dhvani:latest \
  --docker-registry-server-url https://dhvaniacr.azurecr.io \
  --docker-registry-server-user <acr-username> \
  --docker-registry-server-password <acr-password>
```

Manual deploy from a developer machine:

```bash
az acr login --name dhvaniacr
docker build -t dhvaniacr.azurecr.io/dhvani:$(git rev-parse --short HEAD) .
docker push dhvaniacr.azurecr.io/dhvani:$(git rev-parse --short HEAD)
az webapp config container set \
  --name app-dhvani --resource-group rg-innovation-hub \
  --docker-custom-image-name dhvaniacr.azurecr.io/dhvani:$(git rev-parse --short HEAD)
```

### Smoke check

```bash
curl -I https://dhvani.itu.int/api/health     # expect 200
curl -sI https://dhvani.itu.int/auth/signin   # expect 200
```

If sign-in loops back to `/auth/signin`, the redirect URI in the
Entra App Registration doesn't match `NEXTAUTH_URL`.

### Security posture

- **No API keys ever reach the browser.** Every AI call happens in
  server-side route handlers under `app/api/`; keys live only in
  `process.env` on the Web App host. Verified: `grep -r AZURE_OPENAI
  components/ hooks/` returns zero matches.
- Middleware enforces SSO on every protected route.
- `/api/transcribe` self-authenticates via session cookie or
  `x-auth-token` (Chrome extension) so a stolen extension bundle can't
  spoof identity without the signed JWT.

### AI transcription disclaimer

Every transcript surface (in-app panel, shared public view, all export
formats — `.docx`, `.md`, `.txt`, `.json`) carries the ITU AI-output
disclaimer. The canonical wording lives in [`lib/disclaimer.ts`](../lib/disclaimer.ts).
Any change requested by Legal / Institutional Strategy updates that
single file and flows to every surface automatically on the next
deploy. `.srt` exports are deliberately left clean because the cues
are audio-aligned subtitles, not a standalone document — users
receiving `.srt` get the disclaimer embedded in the `.docx`/`.md`
sibling export.

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

## Feature toggles (optional)

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
