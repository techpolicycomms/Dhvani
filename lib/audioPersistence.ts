/**
 * Crash-safe audio chunk persistence.
 *
 * Each recording session gets its own OPFS directory:
 *
 *   /recordings/<sessionId>/
 *     manifest.json               — session metadata
 *     chunk_00001.webm            — 1.5 s audio blob
 *     chunk_00002.webm
 *     ...
 *
 * Writes are atomic (tmp + rename). Every chunk is also logged to
 * IndexedDB so the manifest can be reconstructed if the OPFS copy goes
 * missing. On successful transcription the chunk file + IDB row are
 * deleted. If the browser closes mid-recording, the next launch sees a
 * session whose manifest is still marked "recording" — that's the
 * orphan-recovery surface.
 *
 * OPFS (Origin Private File System) is available in Chromium, Firefox,
 * and Safari 15.2+. When it's not available, persistence is a no-op and
 * capture falls back to the pre-existing in-memory-only behaviour.
 */

const DB_NAME = "dhvani-audio";
const DB_VERSION = 1;
const CHUNK_STORE = "chunks";
const SESSION_STORE = "sessions";
const ROOT_DIR = "recordings";

export type SessionState = "recording" | "finalized";

export type SessionMeta = {
  id: string;
  startedAt: number;
  mimeType: string;
  extension: string;
  state: SessionState;
  // Last chunk index we persisted (1-based). 0 means no chunks yet.
  lastChunkIndex: number;
};

export type ChunkLogEntry = {
  sessionId: string;
  chunkIndex: number;
  bytes: number;
  capturedAtMs: number;
  durationMs: number;
  timestamp: number;
};

export type OrphanSession = {
  meta: SessionMeta;
  chunkIndexes: number[];
};

/** OPFS feature detection. SSR-safe. */
export function isPersistenceSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.storage && navigator.storage.getDirectory);
}

// ---------------------------------------------------------------------
// IndexedDB — second-source-of-truth for chunk metadata.
// ---------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const store = db.createObjectStore(CHUNK_STORE, {
          keyPath: ["sessionId", "chunkIndex"],
        });
        store.createIndex("bySession", "sessionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value as unknown as IDBValidKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllByIndex<T>(
  store: string,
  indexName: string,
  key: IDBValidKey
): Promise<T[]> {
  const db = await openDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).index(indexName).getAll(key);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------
// OPFS helpers.
// ---------------------------------------------------------------------

async function getSessionDir(
  sessionId: string,
  create = false
): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const recordings = await root.getDirectoryHandle(ROOT_DIR, { create: true });
  return recordings.getDirectoryHandle(sessionId, { create });
}

function chunkFileName(index: number): string {
  return `chunk_${String(index).padStart(5, "0")}.webm`;
}

/**
 * Atomic write: write to `<name>.tmp`, close handle (forces flush), then
 * rename to the final path. OPFS move semantics on modern browsers are
 * atomic within the same directory.
 */
async function atomicWriteBlob(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob
): Promise<void> {
  const tmpName = `${name}.tmp`;
  const tmpHandle = await dir.getFileHandle(tmpName, { create: true });
  // createWritable() wipes prior content. On close() the data is flushed
  // to the underlying store.
  const writable = await tmpHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  // Safari 16 lacks move() on FileSystemFileHandle; fall back to
  // copy-then-delete which is still safer than in-place write.
  const fh = tmpHandle as unknown as {
    move?: (parent: FileSystemDirectoryHandle, name: string) => Promise<void>;
  };
  if (typeof fh.move === "function") {
    await fh.move(dir, name);
    return;
  }
  // Fallback: copy via read + write to final name, then remove tmp.
  const tmpFile = await tmpHandle.getFile();
  const finalHandle = await dir.getFileHandle(name, { create: true });
  const finalWritable = await finalHandle.createWritable();
  try {
    await finalWritable.write(tmpFile);
  } finally {
    await finalWritable.close();
  }
  await dir.removeEntry(tmpName).catch(() => {});
}

// ---------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------

/** Generate a new session id — recording_<unix-ms>_<random>. */
export function newSessionId(): string {
  const ms = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  return `recording_${ms}_${rnd}`;
}

/** Storage quota snapshot. Returns all zeros if the API is unavailable. */
export async function checkStorageQuota(): Promise<{
  quota: number;
  usage: number;
  available: number;
}> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage?.estimate
  ) {
    return { quota: 0, usage: 0, available: 0 };
  }
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  return { quota, usage, available: Math.max(0, quota - usage) };
}

/** Ask the browser not to evict us. Returns true if granted. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage?.persist
  ) {
    return false;
  }
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Create a new recording session. Idempotent on same sessionId. */
export async function startRecordingSession(
  sessionId: string,
  init: { mimeType: string; extension: string }
): Promise<SessionMeta> {
  if (!isPersistenceSupported()) {
    return {
      id: sessionId,
      startedAt: Date.now(),
      mimeType: init.mimeType,
      extension: init.extension,
      state: "recording",
      lastChunkIndex: 0,
    };
  }
  const meta: SessionMeta = {
    id: sessionId,
    startedAt: Date.now(),
    mimeType: init.mimeType,
    extension: init.extension,
    state: "recording",
    lastChunkIndex: 0,
  };
  try {
    await getSessionDir(sessionId, true);
    await idbPut(SESSION_STORE, meta);
  } catch (err) {
    console.warn("[audioPersistence] startRecordingSession failed", err);
  }
  return meta;
}

/** Persist one chunk. Silently no-ops on unsupported browsers. */
export async function persistChunk(
  sessionId: string,
  chunkIndex: number,
  blob: Blob,
  chunkMeta: Omit<ChunkLogEntry, "sessionId" | "chunkIndex" | "bytes" | "timestamp">
): Promise<void> {
  if (!isPersistenceSupported()) return;
  try {
    const dir = await getSessionDir(sessionId, true);
    await atomicWriteBlob(dir, chunkFileName(chunkIndex), blob);
    const entry: ChunkLogEntry = {
      sessionId,
      chunkIndex,
      bytes: blob.size,
      capturedAtMs: chunkMeta.capturedAtMs,
      durationMs: chunkMeta.durationMs,
      timestamp: Date.now(),
    };
    await idbPut(CHUNK_STORE, entry);
    const existing = await idbGet<SessionMeta>(SESSION_STORE, sessionId);
    if (existing && chunkIndex > existing.lastChunkIndex) {
      await idbPut(SESSION_STORE, {
        ...existing,
        lastChunkIndex: chunkIndex,
      });
    }
  } catch (err) {
    console.warn("[audioPersistence] persistChunk failed", err);
  }
}

/** Delete one chunk after it has been successfully transcribed. */
export async function markChunkTranscribed(
  sessionId: string,
  chunkIndex: number
): Promise<void> {
  if (!isPersistenceSupported()) return;
  try {
    const dir = await getSessionDir(sessionId, false);
    await dir.removeEntry(chunkFileName(chunkIndex)).catch(() => {});
    await idbDelete(CHUNK_STORE, [sessionId, chunkIndex]);
  } catch {
    /* session dir may already be gone — fine */
  }
}

/**
 * Finalize a session. If every chunk has already been transcribed and
 * deleted, the OPFS directory + IDB session row are removed. Otherwise
 * the session stays in "recording" state so it surfaces as a
 * recoverable orphan (failed-transcription chunks should not be thrown
 * away silently — the user may want to retry).
 */
export async function finalizeSession(sessionId: string): Promise<void> {
  if (!isPersistenceSupported()) return;
  try {
    const remaining = await idbGetAllByIndex<ChunkLogEntry>(
      CHUNK_STORE,
      "bySession",
      sessionId
    );
    if (remaining.length > 0) return;
    const root = await navigator.storage.getDirectory();
    const recordings = await root
      .getDirectoryHandle(ROOT_DIR, { create: true })
      .catch(() => null);
    if (recordings) {
      await recordings
        .removeEntry(sessionId, { recursive: true })
        .catch(() => {});
    }
    await idbDelete(SESSION_STORE, sessionId);
  } catch (err) {
    console.warn("[audioPersistence] finalizeSession failed", err);
  }
}

/**
 * Called by useTranscription after the last in-flight chunk resolves.
 * If a finalize attempt ran while chunks were still transcribing (stop
 * clicked mid-queue), this sweeps away the session once the last chunk
 * lands.
 */
export async function sweepFinalizedSession(
  sessionId: string
): Promise<void> {
  return finalizeSession(sessionId);
}

/** List any sessions that are still marked as "recording" (= crashed). */
export async function listOrphanSessions(): Promise<OrphanSession[]> {
  if (!isPersistenceSupported()) return [];
  try {
    const sessions = await idbGetAll<SessionMeta>(SESSION_STORE);
    const orphans: OrphanSession[] = [];
    for (const meta of sessions) {
      if (meta.state !== "recording") continue;
      const chunks = await idbGetAllByIndex<ChunkLogEntry>(
        CHUNK_STORE,
        "bySession",
        meta.id
      );
      if (chunks.length === 0) {
        // No chunks ever landed — clean up silently.
        await idbDelete(SESSION_STORE, meta.id).catch(() => {});
        continue;
      }
      orphans.push({
        meta,
        chunkIndexes: chunks.map((c) => c.chunkIndex).sort((a, b) => a - b),
      });
    }
    return orphans;
  } catch (err) {
    console.warn("[audioPersistence] listOrphanSessions failed", err);
    return [];
  }
}

/** Load an orphan's chunks back into memory as Blobs, in order. */
export async function recoverSession(
  sessionId: string
): Promise<{ meta: SessionMeta | null; blobs: Blob[] }> {
  if (!isPersistenceSupported()) return { meta: null, blobs: [] };
  const meta = (await idbGet<SessionMeta>(SESSION_STORE, sessionId)) ?? null;
  const chunks = await idbGetAllByIndex<ChunkLogEntry>(
    CHUNK_STORE,
    "bySession",
    sessionId
  );
  chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  const dir = await getSessionDir(sessionId, false).catch(() => null);
  const blobs: Blob[] = [];
  if (dir) {
    for (const entry of chunks) {
      try {
        const fh = await dir.getFileHandle(chunkFileName(entry.chunkIndex));
        blobs.push(await fh.getFile());
      } catch {
        /* chunk missing on disk — skip */
      }
    }
  }
  return { meta, blobs };
}

/** Throw the session away — used when the user clicks "Discard". */
export async function discardSession(sessionId: string): Promise<void> {
  if (!isPersistenceSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const recordings = await root
      .getDirectoryHandle(ROOT_DIR, { create: true })
      .catch(() => null);
    if (recordings) {
      await recordings
        .removeEntry(sessionId, { recursive: true })
        .catch(() => {});
    }
    const chunks = await idbGetAllByIndex<ChunkLogEntry>(
      CHUNK_STORE,
      "bySession",
      sessionId
    );
    for (const c of chunks) {
      await idbDelete(CHUNK_STORE, [c.sessionId, c.chunkIndex]).catch(() => {});
    }
    await idbDelete(SESSION_STORE, sessionId).catch(() => {});
  } catch (err) {
    console.warn("[audioPersistence] discardSession failed", err);
  }
}
