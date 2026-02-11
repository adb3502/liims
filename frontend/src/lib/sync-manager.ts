/**
 * Sync Manager - Background sync engine for processing queued offline mutations.
 *
 * Features:
 * - Processes queued mutations when online
 * - Retry logic with exponential backoff
 * - Conflict resolution (server wins with user notification)
 * - Sync progress events for UI
 */

import api from '@/lib/api'
import {
  clearSyncedMutations,
  getAllMutations,
  getMeta,
  getPendingMutations,
  removeMutation,
  setMeta,
  updateMutationStatus,
  type OfflineMutation,
} from '@/lib/offline-store'

export type SyncState = 'idle' | 'syncing' | 'error'

export interface SyncProgress {
  state: SyncState
  total: number
  completed: number
  failed: number
  conflicts: SyncConflict[]
  lastSyncTime: string | null
  error: string | null
}

export interface SyncConflict {
  entity_type: string
  entity_id: string
  field: string
  client_value: string | null
  server_value: string | null
  resolved_value: string | null
}

type SyncListener = (progress: SyncProgress) => void

// ── Module state ───────────────────────────────────────────────────────

let syncState: SyncState = 'idle'
let syncTimer: ReturnType<typeof setTimeout> | null = null
let retryCount = 0
const MAX_RETRIES = 5
const BASE_DELAY_MS = 2000
const listeners = new Set<SyncListener>()

const currentProgress: SyncProgress = {
  state: 'idle',
  total: 0,
  completed: 0,
  failed: 0,
  conflicts: [],
  lastSyncTime: null,
  error: null,
}

// ── Event system ───────────────────────────────────────────────────────

export function addSyncListener(listener: SyncListener): () => void {
  listeners.add(listener)
  // Send current state immediately
  listener({ ...currentProgress })
  return () => listeners.delete(listener)
}

function notifyListeners(): void {
  const snapshot = { ...currentProgress }
  listeners.forEach((fn) => fn(snapshot))
}

function updateProgress(partial: Partial<SyncProgress>): void {
  Object.assign(currentProgress, partial)
  notifyListeners()
}

// ── Sync engine ────────────────────────────────────────────────────────

/**
 * Trigger a sync attempt. If already syncing, this is a no-op.
 */
export async function triggerSync(): Promise<SyncProgress> {
  if (syncState === 'syncing') return { ...currentProgress }
  if (!navigator.onLine) {
    updateProgress({ state: 'idle', error: 'Offline' })
    return { ...currentProgress }
  }

  syncState = 'syncing'
  updateProgress({ state: 'syncing', error: null })

  try {
    const pending = await getPendingMutations()
    if (pending.length === 0) {
      syncState = 'idle'
      const lastSync = await getMeta<string>('last_sync_time')
      updateProgress({
        state: 'idle',
        total: 0,
        completed: 0,
        failed: 0,
        lastSyncTime: lastSync,
      })
      return { ...currentProgress }
    }

    updateProgress({ total: pending.length, completed: 0, failed: 0, conflicts: [] })

    // Mark all as syncing
    for (const m of pending) {
      await updateMutationStatus(m.id, 'syncing')
    }

    // Push batch to server
    const result = await pushMutations(pending)

    // Process results
    const applied = result.applied || 0
    const conflicts = result.conflicts || []
    const errors = result.errors || []

    // Remove successfully synced mutations
    for (const m of pending) {
      const hasError = errors.some(
        (e: { mutation_id?: string }) => e.mutation_id === m.id,
      )
      if (!hasError) {
        await removeMutation(m.id)
      } else {
        await updateMutationStatus(m.id, 'failed')
      }
    }

    // Cleanup any old synced mutations
    await clearSyncedMutations()

    const now = new Date().toISOString()
    await setMeta('last_sync_time', now)

    syncState = 'idle'
    retryCount = 0
    updateProgress({
      state: 'idle',
      completed: applied,
      failed: errors.length,
      conflicts: conflicts,
      lastSyncTime: now,
    })

    return { ...currentProgress }
  } catch (err) {
    syncState = 'error'
    const message = err instanceof Error ? err.message : 'Sync failed'
    updateProgress({ state: 'error', error: message })

    // Schedule retry with exponential backoff
    scheduleRetry()

    return { ...currentProgress }
  }
}

async function pushMutations(
  mutations: OfflineMutation[],
): Promise<{
  applied: number
  skipped: number
  conflicts: SyncConflict[]
  errors: { mutation_id?: string; error: string }[]
}> {
  const response = await api.post('/sync/push', {
    mutations: mutations.map((m) => ({
      id: m.id,
      type: m.type,
      entity_id: m.entity_id,
      timestamp: m.timestamp,
      payload: m.payload,
    })),
  })
  return response.data.data
}

// ── Retry with exponential backoff ─────────────────────────────────────

function scheduleRetry(): void {
  if (retryCount >= MAX_RETRIES) {
    updateProgress({
      state: 'error',
      error: `Sync failed after ${MAX_RETRIES} retries. Will retry when online.`,
    })
    return
  }

  const delay = BASE_DELAY_MS * Math.pow(2, retryCount)
  retryCount++

  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    if (navigator.onLine) {
      triggerSync()
    }
  }, delay)
}

// ── Auto-sync on reconnect ─────────────────────────────────────────────

/**
 * Start listening for online/offline events and trigger sync on reconnect.
 * Also tries to register for Background Sync API where available.
 */
export function startSyncManager(): void {
  // Listen for online event to trigger sync
  window.addEventListener('online', () => {
    retryCount = 0
    triggerSync()
  })

  // Try Background Sync API registration
  registerBackgroundSync()

  // Initial sync if online and have pending mutations
  if (navigator.onLine) {
    // Small delay to let the app initialize
    setTimeout(() => triggerSync(), 3000)
  }

  // Load last sync time from meta
  getMeta<string>('last_sync_time').then((time) => {
    if (time) {
      updateProgress({ lastSyncTime: time })
    }
  })
}

export function stopSyncManager(): void {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
}

// ── Background Sync API ────────────────────────────────────────────────

async function registerBackgroundSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  try {
    const registration = await navigator.serviceWorker.ready
    if ('sync' in registration) {
      await (registration as ServiceWorkerRegistration & {
        sync: { register: (tag: string) => Promise<void> }
      }).sync.register('liims-offline-sync')
    }
  } catch {
    // Background Sync not supported, fallback to manual sync is already in place
  }
}

// ── Listen for service worker sync completion messages ──────────────────

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_COMPLETE') {
      const result = event.data.result
      const now = new Date().toISOString()
      updateProgress({
        state: 'idle',
        completed: result.applied || 0,
        failed: result.errors || 0,
        lastSyncTime: now,
      })
    }
  })
}

// ── Utility functions ──────────────────────────────────────────────────

export async function getPendingQueueCount(): Promise<number> {
  const mutations = await getAllMutations()
  return mutations.filter((m) => m.status === 'pending' || m.status === 'failed').length
}

export function getSyncProgress(): SyncProgress {
  return { ...currentProgress }
}
