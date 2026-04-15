# Dhvani — Azure Deployment Guide

This guide walks through standing up Dhvani as a centralized, org-wide service on **Azure Web App for Containers**, with **Microsoft Entra ID** single sign-on and **GitHub Actions** CI/CD.

The end state:

- Users open `https://dhvani.<your-org>.com`, sign in with their work Microsoft account, and start transcribing.
- Transcription goes to the org's **Azure OpenAI** `gpt-4o-transcribe-diarize` deployment — with speaker diarization — and audio never leaves the tenant.
- All charges roll up on the single Azure subscription; you, the admin, watch cost and usage on the `/admin` dashboard.

## Prerequisites

- An **Azure subscription** with permission to create resources in a resource group.
- Tenant admin (or `Application.ReadWrite.All`) rights to create an **App Registration**.
- A GitHub account with admin access to this repository's fork.
- An **Azure OpenAI** resource with a **`gpt-4o-transcribe-diarize` deployment** (see §1a). Whisper (`whisper-1`) also works as a fallback — you just lose speaker labels.
- Optional: a custom domain you control (e.g. `dhvani.itu.int`).

## 1. Create the Azure App Registration (Entra SSO)

1. Open **Azure Portal → Entra ID → App registrations → New registration**.
2. Name: `Dhvani`. Supported account types: **Accounts in this organizational directory only** (single tenant).
3. Redirect URI: **Web**, with value
   ```
   https://<your-app-host>/api/auth/callback/microsoft-entra-id
   ```
   (If you haven't provisioned the Web App yet, you can come back and add this URI after step 3. You can also add `http://localhost:3000/api/auth/callback/microsoft-entra-id` for local testing.)
4. After creation, capture:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
5. Go to **Certificates & secrets → New client secret**. Capture the value (not the ID) → `AZURE_AD_CLIENT_SECRET`.
6. Go to **API permissions → Add a permission → Microsoft Graph → Delegated permissions → `openid`, `profile`, `email`, `User.Read`**. Grant admin consent.

## 1a. Create the Azure OpenAI Transcription Deployment

If your tenant already has an Azure OpenAI resource with a `gpt-4o-transcribe-diarize` deployment (e.g. the ITU innovation hub setup), skip to §2 and just capture the values.

1. Open **Azure AI Foundry → Deployments → + Deploy model**.
2. Pick model **`gpt-4o-transcribe-diarize`** (model version `2025-10-15` or later). Give the deployment a name — Dhvani defaults to `gpt-4o-transcribe-diarize`, but any name works as long as you set `AZURE_OPENAI_WHISPER_DEPLOYMENT` to match.
3. Choose a region that hosts the model (e.g. West Europe — `z-oai-innovationhub-dev-euw` — or North Central US). Azure OpenAI endpoints are region-scoped.
4. After the deployment is ready, go to **Keys and Endpoint** on the parent Azure OpenAI resource and capture:
   - **Endpoint** → `AZURE_OPENAI_ENDPOINT` (e.g. `https://z-oai-innovationhub-dev-euw.openai.azure.com/`)
   - **Key 1** → `AZURE_OPENAI_API_KEY`
   - The deployment name from step 2 → `AZURE_OPENAI_WHISPER_DEPLOYMENT`

> 💡 Dhvani calls `client.audio.transcriptions.create({ model: AZURE_OPENAI_WHISPER_DEPLOYMENT })` — for Azure OpenAI the `model` argument is the *deployment* name, not the upstream model id. Keep this in mind if you rename the deployment.

> 🔁 **Falling back to Whisper:** set `AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper-1` (and deploy `whisper` instead) to use the legacy model. Dhvani gracefully drops the speaker labels when the model doesn't return diarization segments.

## 2. Create the Container Registry

```bash
az group create --name dhvani-rg --location eastus
az acr create --resource-group dhvani-rg --name dhvanicr --sku Basic
az acr update --name dhvanicr --admin-enabled true
az acr credential show --name dhvanicr    # capture username and password
```

Capture:

- `ACR_LOGIN_SERVER` = `dhvanicr.azurecr.io`
- `ACR_USERNAME`, `ACR_PASSWORD`

## 3. Create the Web App

```bash
az appservice plan create \
  --resource-group dhvani-rg \
  --name dhvani-plan \
  --is-linux \
  --sku B1

# Placeholder image; the first deploy pipeline run replaces it.
az webapp create \
  --resource-group dhvani-rg \
  --plan dhvani-plan \
  --name dhvani \
  --deployment-container-image-name dhvanicr.azurecr.io/dhvani:latest
```

Wire ACR credentials into the Web App:

```bash
az webapp config container set \
  --resource-group dhvani-rg \
  --name dhvani \
  --docker-custom-image-name dhvanicr.azurecr.io/dhvani:latest \
  --docker-registry-server-url https://dhvanicr.azurecr.io \
  --docker-registry-server-user <ACR_USERNAME> \
  --docker-registry-server-password <ACR_PASSWORD>
```

## 4. Set Environment Variables

In the Azure Portal: **Web App → Settings → Configuration → Application settings**. Add:

| Name | Example / Notes |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | from step 1a |
| `AZURE_OPENAI_ENDPOINT` | from step 1a, e.g. `https://z-oai-innovationhub-dev-euw.openai.azure.com/` |
| `AZURE_OPENAI_WHISPER_DEPLOYMENT` | deployment name from step 1a (default `gpt-4o-transcribe-diarize`) |
| `AZURE_AD_CLIENT_ID` | from step 1 |
| `AZURE_AD_CLIENT_SECRET` | from step 1 |
| `AZURE_AD_TENANT_ID` | from step 1 |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://dhvani.itu.int` (public origin) |
| `ADMIN_EMAILS` | comma-separated, e.g. `rahul.jha@itu.int,it@itu.int` |
| `RATE_LIMIT_MINUTES_PER_HOUR` | `60` |
| `RATE_LIMIT_MINUTES_PER_DAY` | `240` |
| `RATE_LIMIT_MONTHLY_BUDGET_USD` | `500` |
| `USAGE_LOG_PATH` | `/home/data/usage-log.jsonl` (persistent) |
| `WEBSITES_PORT` | `3000` |

Save. The Web App auto-restarts.

> 💡 **Persistence note:** Azure Web App for Containers mounts `/home` as a persistent disk. Pointing `USAGE_LOG_PATH` there ensures the usage log survives container restarts and image rolls.

## 5. Custom Domain + HTTPS

1. **Web App → Custom domains → Add custom domain** and follow the DNS verification.
2. **TLS/SSL settings → Add binding** using an **App Service Managed Certificate** (free).
3. In your App Registration (step 1), update the redirect URI to match the final `https://<domain>/api/auth/callback/microsoft-entra-id`.
4. Update `NEXTAUTH_URL` in app settings to the new domain.

## 6. CI/CD with GitHub Actions

1. Create a **Service Principal** for the workflow:
   ```bash
   az ad sp create-for-rbac \
     --name "dhvani-gh-deploy" \
     --role contributor \
     --scopes /subscriptions/<SUB_ID>/resourceGroups/dhvani-rg \
     --sdk-auth
   ```
   Copy the full JSON output.
2. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:
   - `AZURE_CREDENTIALS` (the JSON from above)
   - `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD`
   - `AZURE_WEBAPP_NAME` = `dhvani`
   - `AZURE_RESOURCE_GROUP` = `dhvani-rg`
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` will build, push, and deploy.

## 7. Verify

- `GET https://dhvani.<domain>/api/health` → `{"status":"ok"}`.
- Open the root URL in an incognito window. You should be redirected to `/auth/signin`, bounce through Microsoft, and land on the main app.
- As an admin email, open `/admin` — you should see the dashboard. As a non-admin, you should see 403.

## 8. Cost Estimate

| Component | Monthly cost |
| --- | --- |
| Azure Web App plan (B1, Linux) | ~$13 |
| Azure Container Registry (Basic) | ~$5 |
| Azure OpenAI transcribe @ ~$0.006/min | $0.36/hour of audio |
| **Light: 100 hours/month** | **~$54** |
| **Heavy: 500 hours/month** | **~$200** |

Pricing for `gpt-4o-transcribe-diarize` may differ from the legacy Whisper rate — verify in **Azure Cost Management**. Dhvani's in-app cost display estimates at the Whisper rate until that's confirmed. Everything is billed through the single Azure subscription — no separate invoice to reconcile.

## 9. Operations Playbook

- **Kill switch:** `/admin → Controls → Service enabled` toggle. Flips the `SERVICE_ENABLED` env var in-process; `/api/transcribe` immediately returns 503.
- **Rotating the Azure OpenAI key:** regenerate Key 1 on the Azure OpenAI resource (Azure Portal → Keys and Endpoint → **Regenerate**), then update `AZURE_OPENAI_API_KEY` in Web App app settings; Azure restarts the container.
- **Scaling:** bump to P1V3 or higher for multi-instance. You'll want to swap the in-memory rate limiter for Redis — the module boundary in `lib/rateLimiter.ts` keeps that a localized change.
- **Log rotation:** the JSONL log grows indefinitely. A cron job that `gzip`s files older than 30 days is fine for the first year. Switch to a database (Postgres, Cosmos, etc.) once you exceed ~1M records.
- **Audit:** download CSV from `/admin`; columns are `timestamp, userId, email, name, audioDurationSeconds, whisperCost, chunkId`.

## 10. Extending Auth

The current setup is single-tenant Entra ID. To support additional identity providers:

1. Add to the `providers: []` array in `lib/auth.ts` — e.g. `GoogleProvider`, `Okta`, `Keycloak`.
2. Set the provider-specific env vars.
3. Restrict sign-ins with a `signIn` callback (e.g. email-domain allowlist).

Dhvani is intentionally tiny and unopinionated here — add what your org needs.
