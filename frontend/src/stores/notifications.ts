import { create } from 'zustand'
import api from '@/lib/api'
import type { Notification } from '@/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  isLoading: boolean

  fetchUnreadCount: () => Promise<void>
  fetchNotifications: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}

let pollInterval: ReturnType<typeof setInterval> | null = null

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchUnreadCount: async () => {
    try {
      const response = await api.get<{ success: true; data: { count: number } }>(
        '/notifications/unread-count'
      )
      set({ unreadCount: response.data.data.count })
    } catch {
      // Silent failure for polling
    }
  },

  fetchNotifications: async () => {
    set({ isLoading: true })
    try {
      const response = await api.get<{
        success: true
        data: Notification[]
        meta: { page: number; per_page: number; total: number }
      }>('/notifications', { params: { per_page: 20 } })
      set({ notifications: response.data.data, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  markAsRead: async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`)
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }))
    } catch {
      // Silent failure
    }
  },

  startPolling: () => {
    get().fetchUnreadCount()
    if (pollInterval) clearInterval(pollInterval)
    pollInterval = setInterval(() => {
      get().fetchUnreadCount()
    }, 30_000) // Poll every 30 seconds
  },

  stopPolling: () => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  },
}))
