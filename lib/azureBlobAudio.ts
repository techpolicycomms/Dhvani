/**
 * Azure Blob Storage — optional voice-recording backend.
 *
 * Scope
 * -----
 * This file is the server-side API for **raw audio** archival. It's a
 * sibling of `azureBlobStorage.ts` (which handles transcript JSON). Audio
 * retention is opt-in per deployment — most ITU users only need the
 * transcript; some workflows (e.g. forensic review, recap re-runs with a
 * better model, compliance retention) need the original audio too.
 *
 * Layout in the container:
 *   audio/<userId>/<sessionId>/manifest.json
 *   audio/<userId>/<sessionId>/chunk_00001.webm
 *   audio/<userId>/<sessionId>/chunk_00002.webm
 *   ...
 *
 * Retention
 * ---------
 * Set `DHVANI_AUDIO_RETENTION_DAYS` (default: 30) on the deployment.
 * A daily lifecycle rule (defined separately in the storage account —
 * see docs/AZURE_BLOB_AUDIO_SETUP.md) deletes blobs older than that.
 * Users can also trigger immediate deletion from the transcript detail
 * page.
 *
 * Activation
 * ----------
 * This backend is OFF by default. It turns on when BOTH:
 *   - AZURE_STORAGE_CONNECTION_STRING (or account + key) is set, AND
 *   - DHVANI_AUDIO_STORAGE=blob
 *
 * When off, the existing client-side OPFS chunk persistence is still
 * used for crash recovery; nothing leaves the browser. Flipping this on
 * requires a legal / privacy review inside ITU because recorded voice is
 * PII under UN staff regulations.
 *
 * Status: SCAFFOLDED. The functions below implement the shape; they are
 * not wired into the capture pipeline yet (see the checklist in
 * docs/AZURE_BLOB_AUDIO_SETUP.md). Do not wire without the privacy review.
 */

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

let containerClient: ContainerClient | null = null;
let initPromise: Promise<ContainerClient> | null = null;

// -----------------------------------------------------------------------
// Activation gate
// -----------------------------------------------------------------------

export function isAudioBlobBackendEnabled(): boolean {
  const explicit = (process.env.DHVANI_AUDIO_STORAGE || "").toLowerCase();
  if (explicit !== "blob") return false;
  return Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
      (process.env.AZURE_STORAGE_ACCOUNT_NAME &&
        process.env.AZURE_STORAGE_ACCOUNT_KEY)
  );
}

export function getAudioRetentionDays(): number {
  const raw = parseInt(process.env.DHVANI_AUDIO_RETENTION_DAYS || "30", 10);
  if (Number.isNaN(raw) || raw < 1) return 30;
  return raw;
}

// -----------------------------------------------------------------------
// Container plumbing
// -----------------------------------------------------------------------

function buildClient(): ContainerClient {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  // Default to a DEDICATED container so lifecycle rules for audio don't
  // affect the transcript container (transcripts may have different
  // retention policies).
  const container =
    process.env.AZURE_AUDIO_CONTAINER || "dhvani-audio";

  let service: BlobServiceClient;
  if (conn) {
    service = BlobServiceClient.fromConnectionString(conn);
  } else if (account && key) {
    const cred = new StorageSharedKeyCredential(account, key);
    service = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      cred
    );
  } else {
    throw new Error(
      "Azure audio storage not configured. Set AZURE_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY) and DHVANI_AUDIO_STORAGE=blob."
    );
  }
  return service.getContainerClient(container);
}

async function getContainer(): Promise<ContainerClient> {
  if (containerClient) return containerClient;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const c = buildClient();
    await c.createIfNotExists();
    containerClient = c;
    return c;
  })();
  return initPromise;
}

// -----------------------------------------------------------------------
// Path helpers
// -----------------------------------------------------------------------

function assertIds(userId: string, sessionId: string) {
  if (!SAFE_ID.test(userId)) throw new Error("Invalid user id.");
  if (!SAFE_ID.test(sessionId)) throw new Error("Invalid session id.");
}

function manifestPath(userId: string, sessionId: string) {
  assertIds(userId, sessionId);
  return `audio/${userId}/${sessionId}/manifest.json`;
}

function chunkPath(userId: string, sessionId: string, index: number) {
  assertIds(userId, sessionId);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid chunk index.");
  }
  const padded = String(index).padStart(5, "0");
  return `audio/${userId}/${sessionId}/chunk_${padded}.webm`;
}

function sessionPrefix(userId: string, sessionId: string) {
  assertIds(userId, sessionId);
  return `audio/${userId}/${sessionId}/`;
}

// -----------------------------------------------------------------------
// Public API — called from /api/audio/* routes
// -----------------------------------------------------------------------

export type AudioSessionManifest = {
  userId: string;
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  mimeType: string;
  extension: string;
  /** Sum of chunk byte sizes so we can display a size on the detail page. */
  totalBytes: number;
  /** Total number of chunks uploaded (monotonically increasing). */
  chunkCount: number;
  /** Optional linkage back to the saved transcript record. */
  transcriptId?: string;
};

/**
 * Upload one audio chunk. The caller is responsible for sequencing chunk
 * indexes (they should match the OPFS persistence chunk index so the
 * pipelines stay in lockstep).
 *
 * Idempotent — re-uploading the same chunkIndex overwrites.
 */
export async function uploadAudioChunk(
  userId: string,
  sessionId: string,
  chunkIndex: number,
  blob: Buffer | Uint8Array,
  contentType = "audio/webm"
): Promise<{ path: string; bytes: number }> {
  const container = await getContainer();
  const path = chunkPath(userId, sessionId, chunkIndex);
  const client = container.getBlockBlobClient(path);
  const body = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  await client.upload(body, body.byteLength, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return { path, bytes: body.byteLength };
}

/** Write or overwrite the per-session manifest. */
export async function writeAudioManifest(
  manifest: AudioSessionManifest
): Promise<void> {
  const container = await getContainer();
  const client = container.getBlockBlobClient(
    manifestPath(manifest.userId, manifest.sessionId)
  );
  const body = JSON.stringify(manifest);
  await client.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

export async function readAudioManifest(
  userId: string,
  sessionId: string
): Promise<AudioSessionManifest | null> {
  const container = await getContainer();
  const client = container.getBlockBlobClient(
    manifestPath(userId, sessionId)
  );
  try {
    const buf = await client.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as AudioSessionManifest;
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return null;
    throw err;
  }
}

/** Delete every blob under the session prefix. Safe to call twice. */
export async function deleteAudioSession(
  userId: string,
  sessionId: string
): Promise<{ deleted: number }> {
  const container = await getContainer();
  let deleted = 0;
  const prefix = sessionPrefix(userId, sessionId);
  for await (const item of container.listBlobsFlat({ prefix })) {
    await container
      .getBlockBlobClient(item.name)
      .deleteIfExists()
      .catch(() => {});
    deleted++;
  }
  return { deleted };
}

/**
 * Generate a short-lived read SAS URL so the browser can stream the
 * audio back directly (e.g. for "re-transcribe with a better model"
 * flows). NOT implemented yet — stub left intentionally so the API
 * shape is obvious.
 */
export async function createAudioReadSasUrl(
  _userId: string,
  _sessionId: string,
  _chunkIndex: number,
  _expiresInSeconds = 300
): Promise<string> {
  throw new Error(
    "createAudioReadSasUrl: not implemented. Wire up BlobSASPermissions + generateBlobSASQueryParameters when re-transcribe UI lands."
  );
}
