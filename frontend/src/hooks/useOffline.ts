/**
 * Offline-aware hooks for PWA offline capabilities.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { getPendingCount } from '@/lib/offline-store'
import {
  addSyncListener,
  getSyncProgress,
  triggerSync,
  type SyncProgress,
} from '@/lib/sync-manager'

// ── useOnlineStatus ────────────────────────────────────────────────────

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine
}

function getServerOnlineSnapshot(): boolean {
  return true // SSR always assumes online
}

/**
 * Track whether the browser is online or offline.
 * Uses useSyncExternalStore for tear-free reads.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot)
}

// ── useOfflineQueue ────────────────────────────────────────────────────

/**
 * Track the number of pending offline mutations.
 * Polls periodically since IndexedDB changes aren't observable.
 */
export function useOfflineQueue(): {
  pendingCount: number
  refresh: () => void
} {
  const [pendingCount, setPendingCount] = useState(0)

  const refresh = useCallback(() => {
    getPendingCount()
      .then(setPendingCount)
      .catch(() => setPendingCount(0))
  }, [])

  useEffect(() => {
    refresh()
    // Poll every 5 seconds for queue changes
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  return { pendingCount, refresh }
}

// ── useSyncStatus ──────────────────────────────────────────────────────

/**
 * Track sync progress and state.
 */
export function useSyncStatus(): {
  progress: SyncProgress
  sync: () => Promise<void>
} {
  const [progress, setProgress] = useState<SyncProgress>(getSyncProgress)

  useEffect(() => {
    return addSyncListener(setProgress)
  }, [])

  const sync = useCallback(async () => {
    await triggerSync()
  }, [])

  return { progress, sync }
}
