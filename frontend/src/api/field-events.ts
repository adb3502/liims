/**
 * TanStack Query hooks for field event operations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type {
  FieldEvent,
  FieldEventCreate,
  FieldEventDetail,
  FieldEventListParams,
  PaginatedResponse,
  SingleResponse,
} from '@/types'

// --- Query keys ---

export const fieldEventKeys = {
  all: ['field-events'] as const,
  lists: () => [...fieldEventKeys.all, 'list'] as const,
  list: (params: FieldEventListParams) =>
    [...fieldEventKeys.lists(), params] as const,
  details: () => [...fieldEventKeys.all, 'detail'] as const,
  detail: (id: string) => [...fieldEventKeys.details(), id] as const,
}

// --- Queries ---

export function useFieldEvents(params: FieldEventListParams) {
  return useQuery({
    queryKey: fieldEventKeys.list(params),
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<FieldEvent>>(
        '/field-events',
        { params }
      )
      return response.data
    },
  })
}

export function useFieldEvent(id: string) {
  return useQuery({
    queryKey: fieldEventKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<FieldEventDetail>>(
        `/field-events/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

// --- Mutations ---

export function useCreateFieldEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: FieldEventCreate) => {
      const response = await api.post<SingleResponse<FieldEvent>>(
        '/field-events',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldEventKeys.lists() })
    },
  })
}

export function useUpdateFieldEvent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<FieldEventCreate> & { status?: string }) => {
      const response = await api.put<SingleResponse<FieldEvent>>(
        `/field-events/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldEventKeys.detail(id) })
      qc.invalidateQueries({ queryKey: fieldEventKeys.lists() })
    },
  })
}

export function useAddParticipants(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participant_ids: string[]) => {
      const response = await api.post(
        `/field-events/${eventId}/participants`,
        { participant_ids }
      )
      return response.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldEventKeys.detail(eventId) })
    },
  })
}

export function useCheckInParticipant(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      participantId,
      data,
    }: {
      participantId: string
      data: { wrist_tag_issued?: boolean; consent_verified?: boolean; notes?: string }
    }) => {
      const response = await api.post(
        `/field-events/${eventId}/check-in`,
        { participant_id: participantId, ...data }
      )
      return response.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldEventKeys.detail(eventId) })
    },
  })
}

export function useBulkDigitize(eventId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: Array<{
      participant_id: string
      check_in_time?: string
      samples_collected?: Record<string, boolean>
      partner_samples?: Record<string, unknown>
      stool_kit_issued?: boolean
      urine_collected?: boolean
      notes?: string
    }>) => {
      const response = await api.post(
        `/field-events/${eventId}/bulk-update`,
        { items }
      )
      return response.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fieldEventKeys.detail(eventId) })
    },
  })
}
