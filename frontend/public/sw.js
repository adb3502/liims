/**
 * LIIMS Service Worker - Full offline support with caching and background sync.
 *
 * Strategies:
 * - Cache-first for static assets (JS, CSS, fonts, images)
 * - Network-first for API calls with offline fallback from cache
 * - Background sync for queued mutations
 */

const CACHE_VERSION = 'v2'
const STATIC_CACHE = `liims-static-${CACHE_VERSION}`
const API_CACHE = `liims-api-${CACHE_VERSION}`
const SYNC_TAG = 'liims-offline-sync'

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
]

// File extensions to cache with cache-first strategy
const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff', '.woff2', '.ttf', '.eot',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
]

// API paths to cache responses for offline reading
const CACHEABLE_API_PATHS = [
  '/api/v1/collection-sites',
  '/api/v1/participants',
  '/api/v1/samples',
  '/api/v1/field-events',
  '/api/v1/sync/pull',
]

// ── Install ────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    })
  )
  self.skipWaiting()
})

// ── Activate ───────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete old versioned caches
            return (
              (name.startsWith('liims-static-') && name !== STATIC_CACHE) ||
              (name.startsWith('liims-api-') && name !== API_CACHE) ||
              name === 'liims-shell-v1' // Clean up legacy cache
            )
          })
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// ── Fetch ──────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return

  // Skip non-GET for caching (mutations are queued via IndexedDB)
  if (request.method !== 'GET') return

  // API calls: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request))
    return
  }

  // Static assets: cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstWithNetwork(request))
    return
  }

  // Navigation requests (HTML pages): network-first, fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    )
    return
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone()
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
        return response
      })
      .catch(() => caches.match(request))
  )
})

// ── Background Sync ────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue())
  }
})

// ── Message handler for manual sync trigger ────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    processSyncQueue().then((result) => {
      // Notify all clients about sync completion
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_COMPLETE',
            result: result,
          })
        })
      })
    })
  }

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Helper: Check if URL is a static asset ─────────────────────────────

function isStaticAsset(pathname) {
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}

// ── Helper: Cache-first strategy ───────────────────────────────────────

async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Return a basic offline fallback for assets
    return new Response('', { status: 503, statusText: 'Offline' })
  }
}

// ── Helper: Network-first strategy for API ─────────────────────────────

async function networkFirstWithCache(request) {
  const url = new URL(request.url)
  const isCacheable = CACHEABLE_API_PATHS.some((path) =>
    url.pathname.startsWith(path)
  )

  try {
    const response = await fetch(request)
    // Cache successful GET responses for offline reading
    if (response.ok && isCacheable) {
      const cache = await caches.open(API_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline: try to serve from cache
    const cached = await caches.match(request)
    if (cached) return cached

    // Return an offline-aware JSON error
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'OFFLINE',
          message: 'You are offline. This data is not available in the cache.',
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

// ── Helper: Process queued mutations from IndexedDB ────────────────────

async function processSyncQueue() {
  // Open IndexedDB to read the mutation queue
  const db = await openDB()
  if (!db) return { applied: 0, errors: 0 }

  const tx = db.transaction('mutations', 'readonly')
  const store = tx.objectStore('mutations')
  const request = store.getAll()

  return new Promise((resolve) => {
    request.onsuccess = async () => {
      const mutations = request.result || []
      if (mutations.length === 0) {
        db.close()
        resolve({ applied: 0, errors: 0 })
        return
      }

      try {
        // Get the auth token from the token store
        const tokenTx = db.transaction('meta', 'readonly')
        const tokenStore = tokenTx.objectStore('meta')
        const tokenReq = tokenStore.get('access_token')

        tokenReq.onsuccess = async () => {
          const token = tokenReq.result?.value
          if (!token) {
            db.close()
            resolve({ applied: 0, errors: 0, reason: 'no_token' })
            return
          }

          try {
            const response = await fetch('/api/v1/sync/push', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                device_id: await getDeviceId(db),
                mutations: mutations,
              }),
            })

            if (response.ok) {
              const result = await response.json()
              // Clear applied mutations from the queue
              const clearTx = db.transaction('mutations', 'readwrite')
              const clearStore = clearTx.objectStore('mutations')
              for (const mutation of mutations) {
                clearStore.delete(mutation.id)
              }
              db.close()
              resolve(result.data || { applied: mutations.length, errors: 0 })
            } else {
              db.close()
              resolve({ applied: 0, errors: mutations.length })
            }
          } catch {
            db.close()
            resolve({ applied: 0, errors: mutations.length })
          }
        }

        tokenReq.onerror = () => {
          db.close()
          resolve({ applied: 0, errors: 0, reason: 'token_error' })
        }
      } catch {
        db.close()
        resolve({ applied: 0, errors: mutations.length })
      }
    }

    request.onerror = () => {
      db.close()
      resolve({ applied: 0, errors: 0 })
    }
  })
}

// ── Helper: Open IndexedDB ─────────────────────────────────────────────

function openDB() {
  return new Promise((resolve) => {
    const request = indexedDB.open('liims-offline', 2)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
}

// ── Helper: Get/create a stable device ID ──────────────────────────────

async function getDeviceId(db) {
  return new Promise((resolve) => {
    const tx = db.transaction('meta', 'readwrite')
    const store = tx.objectStore('meta')
    const req = store.get('device_id')

    req.onsuccess = () => {
      if (req.result) {
        resolve(req.result.value)
      } else {
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        store.put({ key: 'device_id', value: id })
        resolve(id)
      }
    }

    req.onerror = () => resolve('unknown')
  })
}
