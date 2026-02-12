/**
 * TanStack Query hooks for user management API calls.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type {
  User,
  UserRole,
  PaginatedResponse,
  SingleResponse,
} from '@/types'

// --- Query keys ---

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
}

// --- List params ---

export interface UserListParams {
  page?: number
  per_page?: number
  search?: string
  role?: UserRole
  is_active?: boolean
  sort?: string
  order?: 'asc' | 'desc'
}

// --- User create/update types ---

export interface UserCreate {
  email: string
  full_name: string
  role: UserRole
  password: string
}

export interface UserUpdate {
  full_name?: string
  role?: UserRole
  email?: string
}

// --- Hooks ---

export function useUsers(params: UserListParams = {}) {
  return useQuery({
    queryKey: userKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const response = await api.get<PaginatedResponse<User>>(
        '/users',
        { params: cleanParams }
      )
      return response.data
    },
  })
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<User>>(
        `/users/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: UserCreate) => {
      const response = await api.post<SingleResponse<User>>(
        '/users',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      toast({ description: 'User created successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: UserUpdate) => {
      const response = await api.put<SingleResponse<User>>(
        `/users/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      toast({ description: 'User updated successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/users/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      toast({ description: 'User deactivated.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useResetPassword(id: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await api.post(`/users/${id}/reset-password`)
      return response.data
    },
    onSuccess: () => {
      toast({ description: 'Password reset email sent.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useToggleActivate(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await api.put<SingleResponse<User>>(
        `/users/${id}/activate`
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: userKeys.lists() })
      toast({ description: 'User status updated.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
