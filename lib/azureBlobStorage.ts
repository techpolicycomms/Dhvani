/**
 * Azure Blob Storage backend for saved transcripts.
 *
 * Opt-in alternative to the local-filesystem backend in
 * transcriptStorage.ts. Picked when AZURE_STORAGE_CONNECTION_STRING
 * (or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_CONTAINER) are set.
 *
 * Layout in the container:
 *   transcripts/<userId>/<sessionId>.json
 *
 * Why this exists:
 *   - Survives Web App redeploys (local data/ is wiped each release)
 *   - Works across multi-replica deployments without a shared volume
 *   - Cheap (~$0.02/GB/month) and entirely inside the user's tenant
 *
 * Connection options (any one is enough):
 *   AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;..."
 *   AZURE_STORAGE_ACCOUNT_NAME="myaccount" + AZURE_STORAGE_ACCOUNT_KEY="..."
 *   AZURE_STORAGE_ACCOUNT_NAME="myaccount" (uses Azure AD via DefaultAzureCredential)
 *
 * Container name defaults to "dhvani-transcripts" — override with
 * AZURE_STORAGE_CONTAINER. The container is created on first write
 * if it doesn't exist (private access).
 */

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  type ContainerClient,
} from "@azure/storage-blob";
import type { SavedTranscript, SavedTranscriptMeta } from "./transcriptStorage";

const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

let containerClient: ContainerClient | null = null;
let initPromise: Promise<ContainerClient> | null = null;

function buildClient(): ContainerClient {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const container = process.env.AZURE_STORAGE_CONTAINER || "dhvani-transcripts";

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
      "Azure Blob storage not configured. Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_ACCOUNT_KEY."
    );
  }
  return service.getContainerClient(container);
}

async function getContainer(): Promise<ContainerClient> {
  if (containerClient) return containerClient;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const c = buildClient();
    // Idempotent — creates only if missing. Private access by default.
    await c.createIfNotExists();
    containerClient = c;
    return c;
  })();
  return initPromise;
}

export function isBlobBackendConfigured(): boolean {
  return Boolean(
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
      (process.env.AZURE_STORAGE_ACCOUNT_NAME &&
        process.env.AZURE_STORAGE_ACCOUNT_KEY)
  );
}

function blobPath(userId: string, id: string): string {
  if (!SAFE_ID.test(userId)) throw new Error("Invalid user id.");
  if (!SAFE_ID.test(id)) throw new Error("Invalid transcript id.");
  return `transcripts/${userId}/${id}.json`;
}

function userPrefix(userId: string): string {
  if (!SAFE_ID.test(userId)) throw new Error("Invalid user id.");
  return `transcripts/${userId}/`;
}

export async function saveTranscriptToBlob(
  record: SavedTranscript
): Promise<SavedTranscript> {
  const container = await getContainer();
  const blob = container.getBlockBlobClient(blobPath(record.userId, record.id));
  const body = JSON.stringify(record);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
  return record;
}

export async function listTranscriptsFromBlob(
  userId: string
): Promise<SavedTranscriptMeta[]> {
  const container = await getContainer();
  const items: SavedTranscriptMeta[] = [];
  for await (const blob of container.listBlobsFlat({
    prefix: userPrefix(userId),
  })) {
    try {
      const client = container.getBlockBlobClient(blob.name);
      const buf = await client.downloadToBuffer();
      const parsed = JSON.parse(buf.toString("utf8")) as SavedTranscript;
      const { entries: _entries, speakerNames: _names, ...meta } = parsed;
      void _entries;
      void _names;
      items.push(meta);
    } catch {
      // Corrupt blob — skip rather than 500 the list.
    }
  }
  items.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return items;
}

export async function getTranscriptFromBlob(
  userId: string,
  id: string
): Promise<SavedTranscript | null> {
  const container = await getContainer();
  const blob = container.getBlockBlobClient(blobPath(userId, id));
  try {
    const buf = await blob.downloadToBuffer();
    return JSON.parse(buf.toString("utf8")) as SavedTranscript;
  } catch (err) {
    const code = (err as { statusCode?: number; code?: string }).statusCode;
    if (code === 404) return null;
    throw err;
  }
}

export async function deleteTranscriptFromBlob(
  userId: string,
  id: string
): Promise<void> {
  const container = await getContainer();
  await container
    .getBlockBlobClient(blobPath(userId, id))
    .deleteIfExists();
}
