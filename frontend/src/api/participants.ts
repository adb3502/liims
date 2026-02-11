/**
 * TanStack Query hooks for participant and collection site API calls.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type {
  Participant,
  Consent,
  CollectionSite,
  ParticipantCreate,
  ParticipantUpdate,
  ConsentCreate,
  PaginatedResponse,
  SingleResponse,
  AgeGroup,
  Sex,
} from '@/types'

// --- Query keys ---

export const participantKeys = {
  all: ['participants'] as const,
  lists: () => [...participantKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...participantKeys.lists(), params] as const,
  details: () => [...participantKeys.all, 'detail'] as const,
  detail: (id: string) => [...participantKeys.details(), id] as const,
  consents: (participantId: string) =>
    [...participantKeys.detail(participantId), 'consents'] as const,
  samples: (participantId: string) =>
    [...participantKeys.detail(participantId), 'samples'] as const,
}

export const siteKeys = {
  all: ['collection-sites'] as const,
  list: (params?: Record<string, unknown>) =>
    [...siteKeys.all, 'list', params ?? {}] as const,
}

// --- Participant list params ---

export interface ParticipantListParams {
  page?: number
  per_page?: number
  search?: string
  collection_site_id?: string
  age_group?: AgeGroup
  sex?: Sex
  wave?: number
  sort?: string
  order?: 'asc' | 'desc'
}

// --- Participant detail (extended) ---

export interface ParticipantDetail extends Participant {
  consents: Consent[]
  sample_counts: Record<string, number>
  collection_site: CollectionSite | null
}

// --- Hooks ---

export function useParticipants(params: ParticipantListParams = {}) {
  return useQuery({
    queryKey: participantKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const response = await api.get<PaginatedResponse<Participant>>(
        '/participants',
        { params: cleanParams }
      )
      return response.data
    },
  })
}

export function useParticipant(id: string) {
  return useQuery({
    queryKey: participantKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<ParticipantDetail>>(
        `/participants/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

export function useCreateParticipant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ParticipantCreate) => {
      const response = await api.post<SingleResponse<Participant>>(
        '/participants',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: participantKeys.lists() })
      toast({ description: 'Participant created successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUpdateParticipant(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ParticipantUpdate) => {
      const response = await api.put<SingleResponse<Participant>>(
        `/participants/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: participantKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: participantKeys.lists() })
      toast({ description: 'Participant updated successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useDeleteParticipant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/participants/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: participantKeys.lists() })
      toast({ description: 'Participant deleted.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Consents ---

export function useParticipantConsents(participantId: string) {
  return useQuery({
    queryKey: participantKeys.consents(participantId),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: Consent[] }>(
        `/participants/${participantId}/consents`
      )
      return response.data.data
    },
    enabled: !!participantId,
  })
}

export function useAddConsent(participantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ConsentCreate) => {
      const response = await api.post<SingleResponse<Consent>>(
        `/participants/${participantId}/consents`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: participantKeys.consents(participantId),
      })
      queryClient.invalidateQueries({
        queryKey: participantKeys.detail(participantId),
      })
      toast({ description: 'Consent recorded.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Collection Sites ---

export function useCollectionSites(isActive?: boolean) {
  return useQuery({
    queryKey: siteKeys.list({ is_active: isActive }),
    queryFn: async () => {
      const params = isActive != null ? { is_active: isActive } : {}
      const response = await api.get<{ success: true; data: CollectionSite[] }>(
        '/collection-sites',
        { params }
      )
      return response.data.data
    },
  })
}
