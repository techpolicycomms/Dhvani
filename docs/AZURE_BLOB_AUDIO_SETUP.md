# Azure Blob — Voice-Recording Archival Setup

**Status:** scaffolded, NOT wired into the capture pipeline yet. This
doc explains what the code provides, what's left to do, and the
privacy/legal work that has to happen before the first byte of voice
leaves a user's browser.

---

## TL;DR

- Transcript JSON archival → already shipped (`lib/azureBlobStorage.ts`).
- **Voice-recording archival → scaffolded** (`lib/azureBlobAudio.ts` + `app/api/audio/upload/route.ts`). OFF by default.
- Turning it on requires (1) env vars below, (2) a lifecycle rule on the container, (3) an ITU privacy review, (4) wiring the client upload path.

---

## Architecture

```
Browser                            Server                    Azure Blob Storage
───────                            ──────                    ──────────────────
MediaRecorder ──► OPFS chunk   ──► POST /api/audio/upload  ──► audio/<userId>/<sessionId>/
              (already today)      (new, this PR)              ├── manifest.json
                                                               ├── chunk_00001.webm
                                                               ├── chunk_00002.webm
                                                               └── ...
```

Voice archival is a **fan-out**: chunks are still persisted locally in
OPFS (for crash recovery) and still sent to Azure OpenAI for
transcription. The Blob upload is an *additional* write, not a
replacement.

---

## Activation

Required env vars:

```bash
# Shared Azure storage identity (already used by transcript storage).
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=...;..."
# ...or...
AZURE_STORAGE_ACCOUNT_NAME="itu-dhvani-storage"
AZURE_STORAGE_ACCOUNT_KEY="..."

# Opt-in gate for voice archival (transcripts always archive if the
# connection string is set; audio is a separate opt-in).
DHVANI_AUDIO_STORAGE=blob

# Optional — defaults to "dhvani-audio". Kept separate from the
# transcript container so lifecycle rules can differ.
AZURE_AUDIO_CONTAINER=dhvani-audio

# Optional — defaults to 30. Enforced by the lifecycle rule below, not
# by the app. Values under 1 are ignored.
DHVANI_AUDIO_RETENTION_DAYS=30
```

With the gate off (`DHVANI_AUDIO_STORAGE` unset or anything ≠ `blob`),
the API route returns `{ ok: true, disabled: true }` and nothing is
written. Clients can call the endpoint unconditionally.

---

## Storage-account configuration (do this once)

1. Create a container `dhvani-audio` with private access.
2. Add a **lifecycle management rule**:
   - Scope: blobs under prefix `audio/`
   - Action: **Delete** blobs **more than `DHVANI_AUDIO_RETENTION_DAYS`** days old (set the same number as in env)
   - Trigger: based on last-modified date
3. Enable **soft delete** (7 days) so accidental deletion is recoverable.
4. Restrict public access — no shared keys in env; use a managed
   identity in production Azure deployments where available.
5. CORS — not required; the client never talks to Blob directly. All
   writes go through `/api/audio/upload` (server-side, same origin).

---

## Wiring checklist (when leadership approves)

- [ ] Privacy review signed (recorded voice is PII under UN staff regs).
- [ ] Update `/offline`, `/settings`, and `/install` surfaces with the new consent copy.
- [ ] Add an opt-in toggle in **Settings → Storage** that POSTs to a new `/api/me/audio-consent` endpoint.
- [ ] In `hooks/useAudioCapture.ts`, after `persistChunk`, fire a `fetch('/api/audio/upload', { body: formData })` with `keepalive: true` (best-effort; OPFS is still the source of truth for crash recovery).
- [ ] On transcript save, PATCH the manifest with `transcriptId` so admins can link the two in the future retention UI.
- [ ] Add an admin report listing sessions approaching deletion so users can export before retention fires.
- [ ] Security review on `createAudioReadSasUrl` before using SAS URLs for any "re-transcribe" flow — scope tightly, 5-minute expiry.

---

## Privacy & legal

- Voice is biometric data. The GDPR analogue in the UN Common System
  is "personally identifiable" per ICSC; handling rules apply whether
  or not the recorder is in the EU.
- **Consent must be explicit and revocable.** The app must not upload
  any audio before the toggle is on.
- **Meeting participants other than the recorder** — get legal
  guidance on notice requirements before enabling org-wide.
- Retention (30 days default) should match the transcript retention
  policy or be strictly shorter.
- Deletion — when a user deletes a transcript via the UI, the linked
  audio must be deleted in the same transaction. The scaffold exposes
  `deleteAudioSession()` for this; wire it into the transcript-delete
  route before enabling.

---

## Cost model (order of magnitude)

- 24 kbps Opus → ~180 KB per minute of audio
- 1000 users × 30 min/day × 22 working days/month ≈ 660 GB/month raw
- 30-day retention keeps ≈ 660 GB hot at any given time
- Azure Hot tier ≈ $0.0208/GB/month → ~$14/month for raw storage
- PUT transactions ≈ 40/minute × 660k minutes ≈ $6/month
- Egress only on re-transcribe flows; negligible at current scope

Total: **under $30/month** at 1k active users. Cheap compared to the
Azure OpenAI spend.

---

## Files

| File | Purpose |
|---|---|
| `lib/azureBlobAudio.ts` | Server-side API: `uploadAudioChunk`, `writeAudioManifest`, `readAudioManifest`, `deleteAudioSession`, `createAudioReadSasUrl` (stub). |
| `app/api/audio/upload/route.ts` | HTTP surface for the client. |
| `docs/AZURE_BLOB_AUDIO_SETUP.md` | This file. |

The client side (`hooks/useAudioCapture.ts` instrumentation + consent
UI) is **not yet implemented** — everything above the dotted line is
server-ready; wiring the client is the last step after privacy review.
