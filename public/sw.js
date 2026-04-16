/**
 * Dhvani — production-grade PWA service worker.
 *
 * Strategies:
 *   - Static shell assets: cache-first with a versioned cache name so
 *     deploys force a refresh. SW install caches the shell eagerly.
 *   - Next.js-built assets (/_next/*): cache-first (hashed filenames
 *     bust the cache naturally).
 *   - API calls (/api/*): network-only, never cached.
 *   - Everything else: network-first, cache fallback, with a dedicated
 *     offline page when the network is down and nothing is cached.
 *
 * Background sync: if a transcription chunk POST fails due to network,
 * we queue it in IndexedDB and replay when connectivity returns.
 */

const CACHE_VERSION = "dhvani-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/offline",
];

// -------- Install --------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(SHELL_ASSETS).catch((err) => {
          // Non-critical — the app still works, just won't have an instant
          // offline shell on first load. Log and continue.
          console.warn("SW: shell cache addAll partial failure", err);
        })
      )
      .then(() => self.skipWaiting())
  );
});

// -------- Activate — clear old caches --------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// -------- Fetch --------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API calls: network-only. Never cache transcription responses — they
  // contain user audio data that must not linger on disk.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Non-GET requests (POST share_target etc.): let the network handle it.
  if (event.request.method !== "GET") {
    return;
  }

  // Next.js built assets — content-hashed filenames, so cache-first is
  // safe and gives instant loads on repeat visits.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Google Fonts / external CDN — cache-first with runtime cache.
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else: network-first with cache fallback + offline page.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // If it's a navigation (HTML page), show the offline fallback.
        if (event.request.mode === "navigate") {
          const offlinePage = await caches.match("/offline");
          if (offlinePage) return offlinePage;
        }
        return Response.error();
      })
  );
});

// -------- Background sync for failed transcription chunks --------

const SYNC_TAG = "dhvani-transcribe-retry";
const DB_NAME = "dhvani-sync";
const STORE_NAME = "pending-chunks";

function openSyncDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueChunk(data) {
  try {
    const db = await openSyncDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(data);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {
    /* best effort */
  }
}

async function replayPendingChunks() {
  let db;
  try {
    db = await openSyncDb();
  } catch {
    return;
  }
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const allKeys = await new Promise((res, rej) => {
    const req = store.getAllKeys();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const allValues = await new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  if (!allValues || allValues.length === 0) return;

  const keysToRemove = [];
  for (let i = 0; i < allValues.length; i++) {
    const item = allValues[i];
    try {
      const resp = await fetch(item.url, {
        method: "POST",
        body: item.body,
        headers: item.headers || {},
        credentials: "include",
      });
      if (resp.ok || resp.status === 401 || resp.status === 400) {
        keysToRemove.push(allKeys[i]);
      }
    } catch {
      // Still offline — leave in queue for next sync.
    }
  }

  if (keysToRemove.length > 0) {
    const delTx = db.transaction(STORE_NAME, "readwrite");
    const delStore = delTx.objectStore(STORE_NAME);
    for (const key of keysToRemove) {
      delStore.delete(key);
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayPendingChunks());
  }
});

// Listen for messages from the app to enqueue failed chunks.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ENQUEUE_CHUNK") {
    enqueueChunk(event.data.payload);
    // Request a sync when connectivity returns.
    self.registration.sync.register(SYNC_TAG).catch(() => {
      // Background Sync not supported — chunk is lost.
    });
  }
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
