# Dhvani Security

Dhvani is deployed for 800+ staff at a UN international organisation.
This document describes the security posture of the codebase, how it
is hardened, and how to report vulnerabilities.

## Security measures

### Authentication
- **Microsoft Entra ID SSO** (OpenID Connect) via NextAuth.js v5.
- **JWT session** strategy — 24-hour `maxAge`, `updateAge: 1h` so
  active sessions refresh seamlessly. A stolen cookie is unusable
  after 24 hours.
- **Explicit redirect callback** (`lib/auth.ts`) — same-origin only,
  defeats open-redirect attacks via crafted `callbackUrl`.
- **CSRF protection** built into NextAuth for `/api/auth/*`.

### Authorization
- Every route under `app/api/` checks auth before processing via
  `getActiveUser()` or `resolveRequestUser()`. Audited: zero
  unprotected routes outside the intentionally public
  `/api/health` and `/api/auth/[...nextauth]`.
- Admin surface (`/admin`, `/api/admin/*`) gated on
  `ADMIN_EMAILS` allow-list via `isAdminEmail()`.
- Rate limiting:
  - Transcription: per-user hourly/daily minute caps + org monthly
    budget cap (`lib/rateLimiter.ts` `checkAndReserve`).
  - Chat (summarize / ask / followup): per-user 30 calls/hour via
    `checkChatRate()`. Rejected requests log a `rate_limit`
    security event and return `429` with `Retry-After`.

### Input validation
- File uploads (`/api/transcribe`): Content-Type must be
  `multipart/form-data`, file field must be an
  `audio/*` or `video/*` MIME, size ≤ 25 MB. Pre-checks fail fast
  with 400/413 — never 500.
- Path segments (user ids, session ids) sanitised via
  `sanitizePathSegment()` in `lib/security.ts`. Storage helpers
  (`lib/transcriptStorage.ts`, `lib/vocabulary.ts`,
  `app/api/vocabulary/route.ts`) double-check the resolved path
  stays inside the data directory with `ensureWithinDir()`.
- Search highlighting escapes user-provided regex input via
  `escapeRegex()`.
- No `dangerouslySetInnerHTML` in user-facing components. The one
  instance (`app/layout.tsx`) is a static PWA service-worker
  registration script — no user input.

### Error handling
- All API routes log upstream errors server-side via `console.error`
  but return **generic messages** to the client. Audited: no route
  leaks `error.message`, Azure error details, or stack traces.
- Status codes are clamped (`status < 500` preserved, else 500) so
  we never forward a 502/503 from Azure as-is.

### Data protection
- **All AI processing within Azure tenant** — transcription and
  chat hit Azure OpenAI endpoints; no data leaves Azure.
- **No API keys in the browser.** Every Azure OpenAI call runs in
  server-side `app/api/` handlers. Verified with
  `grep -r AZURE_OPENAI components/ hooks/` → zero matches.
- **Audio chunks are processed and discarded** — never persisted to
  disk beyond the life of the transcription request.
- **Transcript storage** is explicit and per-user only; other users
  cannot access another user's transcripts.
- **Share links** use `crypto.randomBytes`-derived tokens (not
  sequential), stored out-of-band of the transcript file so guessing
  a transcript id does not reveal a share.

### HTTP security headers
Applied to every response via `next.config.mjs`:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), geolocation=(), microphone=(self)` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.openai.azure.com https://graph.microsoft.com https://login.microsoftonline.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |

`'unsafe-inline'` + `'unsafe-eval'` in `script-src` are required by
Next.js 14's app-router runtime. Tightening further needs nonce
rollout — tracked as future work.

### Electron security
- `contextIsolation: true`, `nodeIntegration: false`, `webSecurity`
  default (true). The `sandbox: false` flag is required for
  `desktopCapturer` audio capture; the `contextIsolation` boundary
  still applies.
- Preload (`electron/preload.ts`) exposes a narrow typed API via
  `contextBridge.exposeInMainWorld` — no `fs`, no `child_process`,
  no raw `ipcRenderer`.
- `will-navigate` handler blocks any navigation outside the target
  origin; `setWindowOpenHandler` routes new-window requests to the
  user's default browser via `shell.openExternal`.
- Production Electron build loads **only** the central server URL
  or the `data:` offline-retry fallback. No local server is bundled.

### Privacy
- **Org Intelligence opt-in** defaults to **OFF**. The client sends
  `x-contribute-insights: true` only when the user has explicitly
  enabled the toggle in settings. Prior meetings are never
  retroactively contributed.
- **K-anonymity enforced** in `lib/orgIntelligence.ts` —
  departments with fewer than 5 contributor-day pairs **or** fewer
  than 10 meetings are collapsed into "Other Departments" before
  the dashboard ever sees the numbers.
- **No raw text, speaker names, or attendee emails** reach the
  intelligence layer. Only: department, rounded UTC day, duration,
  ≤5 topic keywords, sentiment bucket, action-item count, speaker
  count, language code.
- Existing anonymised data **cannot be retroactively withdrawn** —
  records carry no user id by design. Opting out halts future
  contributions; past records remain in the aggregate. This is
  documented to users in the opt-in UI.

### Logging
- `lib/security.ts` exposes `logSecurityEvent()` for
  `auth_failure`, `rate_limit`, `path_traversal`, `invalid_input`,
  `upload_rejected`, `forbidden`. Logs are structured for grep /
  Application Insights parsing — never include audio payloads,
  transcript text, or tokens.
- Verified no API route logs `AZURE_OPENAI_API_KEY`,
  `AZURE_AD_CLIENT_SECRET`, or `NEXTAUTH_SECRET`.

### Secret management
- `.env`, `.env.*.local`, `.env.backup`, `*.pem`, `*.key`, `*.cert`,
  `*.p12`, `*.pfx`, `dist/`, `dist-electron/`, `*.dmg`, `*.exe`,
  `*.blockmap`, `/data/` are all gitignored.
- Git history check: `.env` / `.env.local` never committed to any
  branch (`git log --all --oneline -- .env .env.local` empty).
- Build output check: `AZURE_OPENAI_API_KEY`,
  `AZURE_AD_CLIENT_SECRET`, `NEXTAUTH_SECRET` never appear in
  `.next/static/` — verified per release.

### Dependency management
- `npm audit`: **0 critical**, 13 high (all transitive via
  `electron`/`electron-builder` devDependencies — not shipped to
  users), 4 low. Run `npm audit` before each release.
- `next` pinned to `^14.2.35` to pick up all 14.x security patches
  without the breaking 15/16 major jump.
- CI should gate on `npm audit --omit=dev --audit-level=high`
  (runtime deps only) to avoid false positives from build tooling.

## Audit log

### 2026-04-17 — Initial comprehensive security audit

Performed by code review + automated scanning. Findings and fixes:

| Phase | Finding | Action |
|---|---|---|
| 1 — Secrets | Clean — no hardcoded secrets, no `.env` in git history, no NEXT_PUBLIC_ secrets, no secrets in build output. | Extended `.gitignore` to add `*.key`, `*.cert`, `*.p12`, `*.pfx`, build artifacts, `/data/`. |
| 2A — Route auth | All routes under `app/api/` check auth except the intentional `/api/health` and `/api/auth/*`. | No gaps; documented. |
| 2B — Error leaks | 3 routes returned `err.message` to the client: `transcribe`, `summarize`, `ask`. | Replaced with generic messages; upstream errors log server-side. |
| 2C — Path traversal | `lib/transcriptStorage.ts` already had a `SAFE_ID` regex. `lib/vocabulary.ts` and `app/api/vocabulary/route.ts` built paths from raw `userId`. | Created `lib/security.ts` (`sanitizePathSegment`, `ensureWithinDir`). Applied in vocabulary read/write. Defence-in-depth given Entra-issued UUIDs would already pass the regex. |
| 2D — Rate limit | Transcription limited. Chat routes (`summarize`, `ask`, `followup`) unlimited. | Added `checkChatRate()` in rate limiter: 30 calls/hour/user (configurable via `RATE_LIMIT_CHAT_PER_HOUR`). 429 with `Retry-After`. |
| 3 — XSS | One `dangerouslySetInnerHTML` in `app/layout.tsx` — static PWA SW registration, no user input. Search highlighting already uses `escapeRegex`. | No action — documented. |
| 4 — Session | JWT strategy; default 30-day maxAge; no explicit redirect callback. | Tightened `maxAge` to 24 h + `updateAge` 1 h; added explicit same-origin redirect callback. |
| 5 — Headers | No security headers set. | Added CSP, HSTS, X-CTO, X-Frame-Options, Referrer-Policy, Permissions-Policy via `next.config.mjs`. |
| 6 — Deps | 19 vulns: 1 critical (next), 12 high, 2 moderate, 4 low. | `npm audit fix` + bump `next` to `^14.2.35` → 0 critical, 0 moderate, 13 high (all dev-only), 4 low. |
| 7 — Upload | Type + size validation in place. | No action. |
| 8 — Electron | `contextIsolation: true`, `nodeIntegration: false`. No `will-navigate` handler. | Added `will-navigate` + `setWindowOpenHandler` — navigation off-origin opens in default browser instead of taking over the BrowserWindow. |
| 9 — Privacy | K-anonymity and opt-in default OFF already correct. | Documented in this file. |
| 10 — Logging | No secret-leakage in logs. | Added `logSecurityEvent()` for structured security-event logging; wired into rate-limit + path-traversal rejections. |

## Vulnerability disclosure

Report security issues to **rahul.jha@itu.int**. Do **not** open public
GitHub issues for security vulnerabilities.

## Scope notes

The following are explicitly out of scope for this codebase and must be
addressed in the Azure Web App / tenant configuration:

- TLS termination (Azure Web App's built-in HTTPS with Microsoft-managed
  certificate; custom domains get Azure-issued certs).
- Key rotation procedure (Azure Key Vault rotation policy or manual
  `az openai keys regenerate` workflow).
- Azure Web App firewall / Private Endpoint configuration to restrict
  inbound traffic.
- Microsoft Entra App Registration scope review — ensure the granted
  Graph permissions (`Calendars.Read`, `User.Read`) match what the app
  needs.
