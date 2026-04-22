# Microsoft Entra ID — App Registration checklist for Dhvani

This is the **only** tenant-side configuration needed for Dhvani to
work end-to-end. Everything else lives in the app's environment
variables (see `.env.production.example`).

Do this once per environment (`localhost`, `staging`, `production`).

---

## 1. Create the App Registration

Azure Portal → **Microsoft Entra ID** → **App registrations** → **New registration**

- **Name**: `Dhvani` (or `Dhvani (staging)` etc.)
- **Supported account types**: *Accounts in this organizational directory only* (single tenant)
- **Redirect URI**: leave blank for now — we'll add it next

Save. Copy the **Application (client) ID** and **Directory (tenant) ID** from the overview page.

## 2. Redirect URIs

App registration → **Authentication** → **Add a platform** → **Web**

Add one redirect URI per environment. The shape is always
`{NEXTAUTH_URL}/api/auth/callback/microsoft-entra-id`:

| Environment | Redirect URI |
|---|---|
| Local dev | `http://localhost:3000/api/auth/callback/microsoft-entra-id` |
| Production | `https://dhvani.itu.int/api/auth/callback/microsoft-entra-id` |

Under **Implicit grant and hybrid flows**: leave **unchecked**
(we use the server-side OAuth code flow).

Under **Advanced settings → Allow public client flows**: **No**.

## 3. Client secret

App registration → **Certificates & secrets** → **Client secrets** → **New client secret**

- Description: `Dhvani prod` (or dated — `2026-04 rotation`)
- Expires: 24 months (align with your key-rotation policy)

**Copy the secret value immediately** — it's shown only once. This becomes
`AZURE_AD_CLIENT_SECRET` in the Web App configuration.

## 4. API permissions

App registration → **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**.

Add each of these and then click **Grant admin consent for \<tenant\>**
(requires Global Admin or a Cloud App Administrator role):

| Permission | Why |
|---|---|
| `openid` | OIDC identity |
| `profile` | Name, preferred_username |
| `email` | Verified email claim |
| `offline_access` | Refresh token — calendar stays live past the 1-hour access-token expiry without forcing users to re-login |
| `User.Read` | `/me` endpoint (id, displayName, mail) |
| `Calendars.Read` | Populates "Today's meetings" on the home page |

After clicking admin consent, every row should show a green check under **Status**.

> If admin consent is **not** granted for `Calendars.Read`, Dhvani still
> works — the home page just shows an empty calendar with "no meetings
> today". Users will see a degraded experience but nothing crashes.

## 5. Optional: surface `department` as a token claim

Org Intelligence groups anonymised meetings by department. The
`department` claim is sourced from the user directory but isn't in
Entra ID tokens by default.

App registration → **Token configuration** → **Add optional claim** → **ID** → tick `department` → **Add**.

Repeat for **Access** → tick `department` → **Add**.

> Skippable — without this, department shows as `Unknown` in the Org
> Intelligence tab. Every other feature is unaffected.

## 6. Put the values into the Web App

Paste into Azure Portal → `app-dhvani` → **Configuration** → **Application settings**:

```
AZURE_AD_CLIENT_ID=<Application (client) ID from step 1>
AZURE_AD_CLIENT_SECRET=<secret value from step 3>
AZURE_AD_TENANT_ID=<Directory (tenant) ID from step 1>
NEXTAUTH_SECRET=<output of `openssl rand -base64 32`>
NEXTAUTH_URL=https://dhvani.itu.int
ADMIN_EMAILS=<comma-separated admin emails>
```

…plus the Azure OpenAI variables from `.env.production.example`.

Save and restart the Web App.

## 7. Verify end-to-end

From a browser **outside** Azure (so the SSO flow is real, not
automatic):

1. Open `https://dhvani.itu.int` → redirects to `/auth/signin`.
2. Click "Sign in with your ITU account" → Microsoft prompt appears
   → consent screen lists the six permissions above → approve.
3. Redirects back to `https://dhvani.itu.int/` → home page with your
   name in the top-right avatar.
4. Today's meetings should populate (if `Calendars.Read` was consented).
5. Click an admin-only route (e.g. `/admin`) — if your email is in
   `ADMIN_EMAILS`, you see the dashboard; otherwise 403.
6. Open DevTools → Application → Cookies — you should see
   `__Secure-authjs.session-token` (HTTPS) or `authjs.session-token`
   (localhost), HttpOnly, SameSite=Lax.

If any step fails, check the **Authentication logs** in Entra (App
registration → **Sign-in logs**) — they'll show the failing scope,
redirect URI mismatch, or consent block.

## 8. Rotate

- Secret expiry shows 60 days of warning in the portal.
- Before rotating: create a *new* secret, paste into the Web App's
  Application settings, restart, then delete the old secret.
- Never paste secrets into source control — the `.gitignore` already
  blocks `.env*.local`, `*.pem`, `*.key`, `*.p12`, `*.pfx`.
