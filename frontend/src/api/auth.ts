/**
 * TanStack Query hooks for auth API endpoints.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type { User, SingleResponse } from '@/types'

// --- Query keys ---

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
}

// --- Types ---

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

// --- Hooks ---

export function useMe() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const res = await api.get<SingleResponse<User>>('/auth/me')
      return res.data.data
    },
    staleTime: 300_000, // 5 minutes
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePasswordRequest) => {
      await api.post('/auth/change-password', data)
    },
    onSuccess: () => {
      toast({ description: 'Password changed successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
