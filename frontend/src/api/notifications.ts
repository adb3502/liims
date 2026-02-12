/**
 * TanStack Query hooks for notification API endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type { Notification, PaginatedResponse, SingleResponse } from '@/types'

// --- Query keys ---

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

// --- List params ---

export interface NotificationListParams extends Record<string, unknown> {
  page?: number
  per_page?: number
  type?: string
  severity?: string
  is_read?: boolean
}

// --- Hooks ---

export function useNotifications(params: NotificationListParams = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Notification>>('/notifications', {
        params,
      })
      return res.data
    },
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      const res = await api.get<SingleResponse<{ count: number }>>(
        '/notifications/unread-count'
      )
      return res.data.data.count
    },
    refetchInterval: 30000, // Poll every 30 seconds
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/notifications/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await api.put('/notifications/mark-all-read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
      toast({ description: 'All notifications marked as read.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
