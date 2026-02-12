/**
 * TanStack Query hooks for system settings API calls.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type { SystemSetting } from '@/types'

// --- Query keys ---

export const settingKeys = {
  all: ['settings'] as const,
  lists: () => [...settingKeys.all, 'list'] as const,
  list: () => [...settingKeys.lists()] as const,
  categories: () => [...settingKeys.all, 'category'] as const,
  category: (category: string) => [...settingKeys.categories(), category] as const,
}

// --- Grouped settings response ---

export interface SettingsGroup {
  category: string
  settings: SystemSetting[]
}

// --- Hooks ---

export function useSettings() {
  return useQuery({
    queryKey: settingKeys.list(),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: SettingsGroup[] }>(
        '/settings'
      )
      return response.data.data
    },
  })
}

export function useSettingsByCategory(category: string) {
  return useQuery({
    queryKey: settingKeys.category(category),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: SystemSetting[] }>(
        `/settings/${category}`
      )
      return response.data.data
    },
    enabled: !!category,
  })
}

export function useUpdateSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      category,
      key,
      value,
    }: {
      category: string
      key: string
      value: string
    }) => {
      const response = await api.put<{ success: true; data: SystemSetting }>(
        `/settings/${category}/${key}`,
        { value }
      )
      return response.data.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: settingKeys.list() })
      queryClient.invalidateQueries({ queryKey: settingKeys.category(data.category) })
      toast({ description: 'Setting updated successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
