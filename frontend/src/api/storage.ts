/**
 * TanStack Query hooks for storage management API calls.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { extractErrorMessage } from '@/lib/api'
import { toast } from '@/components/ui/toast'
import type { PaginatedResponse, SingleResponse, FreezerType } from '@/types'

// --- Types ---

export interface FreezerRead {
  id: string
  name: string
  freezer_type: FreezerType
  location: string | null
  total_capacity: number | null
  rack_count: number | null
  slots_per_rack: number | null
  is_active: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  used_positions: number
  total_positions: number
  utilization_pct: number
}

export interface RackRead {
  id: string
  freezer_id: string
  rack_name: string
  position_in_freezer: number | null
  capacity: number | null
  created_at: string
  updated_at: string
}

export interface BoxRead {
  id: string
  rack_id: string
  box_name: string
  box_label: string | null
  rows: number
  columns: number
  box_type: string
  box_material: string | null
  position_in_rack: number | null
  group_code: string | null
  collection_site_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  occupied_count: number
  total_slots: number
}

export interface PositionRead {
  id: string
  box_id: string
  row: number
  column: number
  sample_id: string | null
  occupied_at: string | null
  locked_by: string | null
  locked_at: string | null
  sample_code: string | null
}

export interface BoxDetail extends BoxRead {
  positions: PositionRead[]
}

export type FreezerEventType = 'excursion' | 'failure' | 'maintenance' | 'recovery'

export interface TempEventRead {
  id: string
  freezer_id: string
  event_type: FreezerEventType
  event_start: string
  event_end: string | null
  observed_temp_c: number | null
  reported_by: string
  samples_affected_count: number | null
  resolution_notes: string | null
  requires_sample_review: boolean
  created_at: string
}

export interface StorageSearchResult {
  sample_id: string
  sample_code: string
  position_id: string
  row: number
  column: number
  box_id: string
  box_name: string
  rack_id: string
  rack_name: string
  freezer_id: string
  freezer_name: string
}

// --- Query keys ---

export const storageKeys = {
  all: ['storage'] as const,
  freezers: () => [...storageKeys.all, 'freezers'] as const,
  freezerList: (params: Record<string, unknown>) =>
    [...storageKeys.freezers(), 'list', params] as const,
  freezerDetail: (id: string) => [...storageKeys.freezers(), id] as const,
  racks: (freezerId: string) =>
    [...storageKeys.freezerDetail(freezerId), 'racks'] as const,
  boxes: () => [...storageKeys.all, 'boxes'] as const,
  boxList: (params: Record<string, unknown>) =>
    [...storageKeys.boxes(), 'list', params] as const,
  boxDetail: (id: string) => [...storageKeys.boxes(), id] as const,
  tempEvents: (freezerId: string) =>
    [...storageKeys.freezerDetail(freezerId), 'temp-events'] as const,
  search: (code: string) => [...storageKeys.all, 'search', code] as const,
}

// --- Freezer hooks ---

export function useFreezers(params: {
  page?: number
  per_page?: number
  freezer_type?: FreezerType
  is_active?: boolean
} = {}) {
  return useQuery({
    queryKey: storageKeys.freezerList(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null)
      )
      const response = await api.get<PaginatedResponse<FreezerRead>>(
        '/storage/freezers',
        { params: cleanParams }
      )
      return response.data
    },
  })
}

export function useFreezer(id: string) {
  return useQuery({
    queryKey: storageKeys.freezerDetail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<FreezerRead>>(
        `/storage/freezers/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

export function useCreateFreezer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      freezer_type: FreezerType
      location?: string
      rack_count?: number
      slots_per_rack?: number
      notes?: string
    }) => {
      const response = await api.post<SingleResponse<FreezerRead>>(
        '/storage/freezers',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
      toast({ description: 'Freezer created successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUpdateFreezer(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name?: string
      freezer_type?: FreezerType
      location?: string
      notes?: string
      is_active?: boolean
    }) => {
      const response = await api.put<SingleResponse<FreezerRead>>(
        `/storage/freezers/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.freezerDetail(id) })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
      toast({ description: 'Freezer updated.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Rack hooks ---

export function useRacks(freezerId: string) {
  return useQuery({
    queryKey: storageKeys.racks(freezerId),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: RackRead[]; meta: { count: number } }>(
        `/storage/freezers/${freezerId}/racks`
      )
      return response.data.data
    },
    enabled: !!freezerId,
  })
}

export function useCreateRack(freezerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { rack_name: string; position_in_freezer?: number; capacity?: number }) => {
      const response = await api.post<SingleResponse<RackRead>>(
        `/storage/freezers/${freezerId}/racks`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.racks(freezerId) })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezerDetail(freezerId) })
      toast({ description: 'Rack created.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useBatchCreateRacks(freezerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { count: number; label_prefix?: string }) => {
      const response = await api.post<{ success: true; data: RackRead[]; meta: { count: number } }>(
        `/storage/freezers/${freezerId}/racks/batch`,
        data
      )
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: storageKeys.racks(freezerId) })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezerDetail(freezerId) })
      toast({ description: `Created ${data.meta.count} rack(s).`, variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Box hooks ---

export function useBoxes(params: {
  page?: number
  per_page?: number
  rack_id?: string
  freezer_id?: string
  group_code?: string
  has_space?: boolean
} = {}) {
  return useQuery({
    queryKey: storageKeys.boxList(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const response = await api.get<PaginatedResponse<BoxRead>>(
        '/storage/boxes',
        { params: cleanParams }
      )
      return response.data
    },
  })
}

export function useBoxDetail(id: string) {
  return useQuery({
    queryKey: storageKeys.boxDetail(id),
    queryFn: async () => {
      const response = await api.get<SingleResponse<BoxDetail>>(
        `/storage/boxes/${id}`
      )
      return response.data.data
    },
    enabled: !!id,
  })
}

export function useCreateBox() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      rack_id: string
      box_name: string
      box_label?: string
      rows?: number
      columns?: number
      box_type?: string
      box_material?: string
      position_in_rack?: number
      group_code?: string
      collection_site_id?: string
    }) => {
      const response = await api.post<SingleResponse<BoxDetail>>(
        '/storage/boxes',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.boxes() })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
      toast({ description: 'Storage box created.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Position hooks ---

export function useAssignSample(positionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sampleId: string) => {
      const response = await api.post<SingleResponse<PositionRead>>(
        `/storage/positions/${positionId}/assign`,
        { sample_id: sampleId }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.boxes() })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
      toast({ description: 'Sample assigned to position.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUnassignSample(positionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await api.post<SingleResponse<PositionRead>>(
        `/storage/positions/${positionId}/unassign`
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.boxes() })
      queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
      toast({ description: 'Sample removed from position.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useAutoAssign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { sample_id: string; freezer_id: string; group_code?: string }) => {
      const response = await api.post<SingleResponse<PositionRead>>(
        '/storage/auto-assign',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.all })
      toast({ description: 'Sample auto-assigned.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useConsolidateBox(sourceBoxId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (targetBoxId: string) => {
      const response = await api.post(
        `/storage/boxes/${sourceBoxId}/consolidate`,
        { target_box_id: targetBoxId }
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.all })
      toast({ description: 'Box consolidated successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Temperature event hooks ---

export function useTempEvents(freezerId: string, params: {
  page?: number
  per_page?: number
} = {}) {
  return useQuery({
    queryKey: [...storageKeys.tempEvents(freezerId), params] as const,
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null)
      )
      const response = await api.get<PaginatedResponse<TempEventRead>>(
        `/storage/freezers/${freezerId}/temperature`,
        { params: cleanParams }
      )
      return response.data
    },
    enabled: !!freezerId,
  })
}

export function useRecordTempEvent(freezerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      event_type: FreezerEventType
      event_start: string
      event_end?: string
      observed_temp_c?: number
      samples_affected_count?: number
      resolution_notes?: string
      requires_sample_review?: boolean
    }) => {
      const response = await api.post<SingleResponse<TempEventRead>>(
        `/storage/freezers/${freezerId}/temperature`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.tempEvents(freezerId) })
      toast({ description: 'Temperature event recorded.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useResolveTempEvent(eventId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      resolution_notes: string
      event_end?: string
      requires_sample_review?: boolean
    }) => {
      const response = await api.put<SingleResponse<TempEventRead>>(
        `/storage/temperature-events/${eventId}/resolve`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.all })
      toast({ description: 'Temperature event resolved.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Search hook ---

export function useStorageSearch(sampleCode: string) {
  return useQuery({
    queryKey: storageKeys.search(sampleCode),
    queryFn: async () => {
      const response = await api.get<{ success: true; data: StorageSearchResult[]; meta: { count: number } }>(
        '/storage/search',
        { params: { sample_code: sampleCode } }
      )
      return response.data.data
    },
    enabled: sampleCode.length >= 2,
  })
}
