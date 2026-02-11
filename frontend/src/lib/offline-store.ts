/**
 * Offline data store using IndexedDB for PWA offline capabilities.
 *
 * Stores:
 * - mutations: Queue of pending mutations to sync when online
 * - cache: Offline-cached entity data (participants, samples, etc.)
 * - meta: Metadata (last sync time, device ID, auth token)
 */

const DB_NAME = 'liims-offline'
const DB_VERSION = 2

export interface OfflineMutation {
  id: string
  type: string
  entity_id?: string
  timestamp: string
  payload: Record<string, unknown>
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  retryCount: number
  createdAt: string
}

export interface CacheEntry {
  key: string
  entityType: string
  data: unknown
  updatedAt: string
}

export interface MetaEntry {
  key: string
  value: unknown
}

// ── Database Connection ────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      if (!db.objectStoreNames.contains('mutations')) {
        const store = db.createObjectStore('mutations', { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }

      if (!db.objectStoreNames.contains('cache')) {
        const store = db.createObjectStore('cache', { keyPath: 'key' })
        store.createIndex('entityType', 'entityType', { unique: false })
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      dbInstance.onclose = () => { dbInstance = null }
      resolve(dbInstance)
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }
  })
}

// ── Mutation Queue ─────────────────────────────────────────────────────

export async function queueMutation(
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
): Promise<string> {
  const db = await openDB()
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  const mutation: OfflineMutation = {
    id,
    type,
    entity_id: entityId,
    timestamp: new Date().toISOString(),
    payload,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readwrite')
    const store = tx.objectStore('mutations')
    const request = store.put(mutation)
    request.onsuccess = () => resolve(id)
    request.onerror = () => reject(new Error('Failed to queue mutation'))
  })
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readonly')
    const store = tx.objectStore('mutations')
    const index = store.index('status')
    const request = index.getAll('pending')
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(new Error('Failed to get pending mutations'))
  })
}

export async function getAllMutations(): Promise<OfflineMutation[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readonly')
    const store = tx.objectStore('mutations')
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(new Error('Failed to get mutations'))
  })
}

export async function updateMutationStatus(
  id: string,
  status: OfflineMutation['status'],
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readwrite')
    const store = tx.objectStore('mutations')
    const getReq = store.get(id)

    getReq.onsuccess = () => {
      const mutation = getReq.result
      if (mutation) {
        mutation.status = status
        if (status === 'failed') {
          mutation.retryCount = (mutation.retryCount || 0) + 1
        }
        const putReq = store.put(mutation)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(new Error('Failed to update mutation'))
      } else {
        resolve()
      }
    }
    getReq.onerror = () => reject(new Error('Failed to get mutation'))
  })
}

export async function removeMutation(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readwrite')
    const store = tx.objectStore('mutations')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to remove mutation'))
  })
}

export async function clearSyncedMutations(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readwrite')
    const store = tx.objectStore('mutations')
    const index = store.index('status')
    const request = index.openCursor('synced')

    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      } else {
        resolve()
      }
    }
    request.onerror = () => reject(new Error('Failed to clear synced mutations'))
  })
}

export async function getPendingCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutations', 'readonly')
    const store = tx.objectStore('mutations')
    const index = store.index('status')
    const request = index.count('pending')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Failed to count pending mutations'))
  })
}

// ── Cache Store ────────────────────────────────────────────────────────

export async function setCacheData(
  key: string,
  entityType: string,
  data: unknown,
): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite')
    const store = tx.objectStore('cache')
    const entry: CacheEntry = {
      key,
      entityType,
      data,
      updatedAt: new Date().toISOString(),
    }
    const request = store.put(entry)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to set cache data'))
  })
}

export async function getCacheData<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly')
    const store = tx.objectStore('cache')
    const request = store.get(key)
    request.onsuccess = () => {
      const entry = request.result as CacheEntry | undefined
      resolve(entry ? (entry.data as T) : null)
    }
    request.onerror = () => reject(new Error('Failed to get cache data'))
  })
}

export async function getCacheByType<T = unknown>(entityType: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly')
    const store = tx.objectStore('cache')
    const index = store.index('entityType')
    const request = index.getAll(entityType)
    request.onsuccess = () => {
      const entries = (request.result || []) as CacheEntry[]
      resolve(entries.map((e) => e.data as T))
    }
    request.onerror = () => reject(new Error('Failed to get cache by type'))
  })
}

export async function clearCache(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite')
    const store = tx.objectStore('cache')
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to clear cache'))
  })
}

// ── Meta Store ─────────────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite')
    const store = tx.objectStore('meta')
    const request = store.put({ key, value })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error('Failed to set meta'))
  })
}

export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly')
    const store = tx.objectStore('meta')
    const request = store.get(key)
    request.onsuccess = () => {
      const entry = request.result as MetaEntry | undefined
      resolve(entry ? (entry.value as T) : null)
    }
    request.onerror = () => reject(new Error('Failed to get meta'))
  })
}

// ── Service Worker Token Sync ──────────────────────────────────────────

/**
 * Store the access token in IndexedDB so the service worker can use it
 * for background sync pushes.
 */
export async function syncTokenToOfflineStore(token: string | null): Promise<void> {
  if (token) {
    await setMeta('access_token', token)
  }
}
