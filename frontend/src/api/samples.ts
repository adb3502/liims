/**
 * TanStack Query hooks for sample API calls.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type {
  Sample,
  SampleCreate,
  SampleStatus,
  SampleType,
  PaginatedResponse,
  SingleResponse,
} from '@/types'

// --- Extended types for detail response ---

export interface StatusHistoryEntry {
  id: string
  sample_id: string
  previous_status: SampleStatus | null
  new_status: SampleStatus
  changed_at: string
  changed_by: string
  notes: string | null
  location_context: string | null
  storage_rule_override_reason: string | null
}

export interface SampleDetail extends Sample {
  status_history: StatusHistoryEntry[]
  aliquots: Sample[]
  processing_elapsed_seconds: number | null
}

// --- Query keys ---

export const sampleKeys = {
  all: ['samples'] as const,
  lists: () => [...sampleKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...sampleKeys.lists(), params] as const,
  details: () => [...sampleKeys.all, 'detail'] as const,
  detail: (id: string) => [...sampleKeys.details(), id] as const,
  history: (id: string) => [...sampleKeys.detail(id), 'history'] as const,
}

// --- List params ---

export interface SampleListQueryParams {
  page?: number
  per_page?: number
  search?: string
  sample_type?: SampleType
  sample_status?: SampleStatus
  participant_id?: string
  wave?: number
  sort?: string
  order?: 'asc' | 'desc'
}

// --- Hooks ---

export function useSamples(params: SampleListQueryParams = {}) {
  return useQuery({
    queryKey: sampleKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const response = await api.get<PaginatedResponse<Sample>>(
        '/samples',
        { params: cleanParams }
      )
      return response.data
    },
  })
}

export function useSample(id: string) {
  return useQuery({
    queryKey: sampleKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<SampleDetail>>(
        `/samples/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
    refetchInterval: (query) => {
      // Auto-refetch every 30s if sample is processing (for timer display)
      const data = query.state.data
      if (data && data.status === 'processing') return 30_000
      return false
    },
  })
}

export function useCreateSample() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: SampleCreate) => {
      const response = await api.post<SingleResponse<Sample>>(
        '/samples',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Sample registered successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUpdateSampleStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { status: SampleStatus; notes?: string; location_context?: string }) => {
      const response = await api.post<SingleResponse<Sample>>(
        `/samples/${id}/status`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sampleKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Sample status updated.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useGenerateAliquots(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<{ success: true; data: Sample[]; meta: { count: number } }>(
        `/samples/${id}/aliquot`
      )
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sampleKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: `Generated ${data.meta.count} aliquot(s).`, variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useWithdrawVolume(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { volume_ul: number; reason?: string }) => {
      const response = await api.post<SingleResponse<Sample>>(
        `/samples/${id}/withdraw`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sampleKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Volume withdrawn successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useRequestDiscard(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { reason: string; reason_notes?: string }) => {
      const response = await api.post(
        `/samples/${id}/discard-request`,
        data
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sampleKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Discard request submitted.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useSampleHistory(id: string) {
  return useQuery({
    queryKey: sampleKeys.history(id),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: StatusHistoryEntry[] }>(
        `/samples/${id}/history`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

// --- Discard request list & approval ---

export interface DiscardRequestEntry {
  id: string
  sample_id: string
  requested_by: string
  requested_at: string
  reason: string
  reason_notes: string | null
  approved_by: string | null
  approved_at: string | null
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
}

export const discardKeys = {
  all: ['discard-requests'] as const,
  list: (status?: string) => [...discardKeys.all, status ?? 'all'] as const,
}

export function useDiscardRequests(status?: string) {
  return useQuery({
    queryKey: discardKeys.list(status),
    queryFn: async () => {
      const params = status ? { request_status: status } : {}
      const response = await api.get<{ success: true; data: DiscardRequestEntry[] }>(
        '/samples/discard-requests',
        { params }
      )
      return response.data.data
    },
  })
}

export function useApproveDiscard(requestId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { approved: boolean; rejection_reason?: string }) => {
      const response = await api.post(
        `/samples/discard-requests/${requestId}/approve`,
        data
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: discardKeys.all })
      queryClient.invalidateQueries({ queryKey: sampleKeys.lists() })
      toast({ description: 'Discard request processed.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
