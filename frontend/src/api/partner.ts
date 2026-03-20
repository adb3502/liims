/**
 * TanStack Query hooks for partner integration (ODK, imports, canonical tests, stool kits).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type {
  CanonicalTest,
  OdkFormConfig,
  OdkSyncLog,
  PartnerLabImport,
  PartnerLabResult,
  PartnerName,
  StoolKit,
  StoolKitStatus,
  TestNameAlias,
  PaginatedResponse,
  SingleResponse,
  ListParams,
} from '@/types'

// --- Query Keys ---

export const odkKeys = {
  all: ['odk'] as const,
  formConfigs: () => [...odkKeys.all, 'form-configs'] as const,
  syncLogs: (params?: ListParams) => [...odkKeys.all, 'sync-logs', params] as const,
  submissions: (params?: Record<string, unknown>) => [...odkKeys.all, 'submissions', params] as const,
}

export const importKeys = {
  all: ['imports'] as const,
  lists: () => [...importKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...importKeys.lists(), params] as const,
  detail: (id: string) => [...importKeys.all, 'detail', id] as const,
  preview: (id: string) => [...importKeys.all, 'preview', id] as const,
}

export const canonicalTestKeys = {
  all: ['canonical-tests'] as const,
  lists: () => [...canonicalTestKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...canonicalTestKeys.lists(), params] as const,
  aliases: (testId: string) => [...canonicalTestKeys.all, 'aliases', testId] as const,
}

export const stoolKitKeys = {
  all: ['stool-kits'] as const,
  lists: () => [...stoolKitKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...stoolKitKeys.lists(), params] as const,
}

export const partnerResultKeys = {
  all: ['partner-results'] as const,
  lists: () => [...partnerResultKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...partnerResultKeys.lists(), params] as const,
  byParticipant: (participantId: string) =>
    [...partnerResultKeys.all, 'participant', participantId] as const,
}

// --- ODK Queries ---

export function useOdkFormConfigs() {
  return useQuery({
    queryKey: odkKeys.formConfigs(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: OdkFormConfig[] }>('/partner/odk/form-configs')
      return res.data.data
    },
  })
}

export function useOdkSyncLogs(params: ListParams = {}) {
  return useQuery({
    queryKey: odkKeys.syncLogs(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<OdkSyncLog>>('/partner/odk/sync-logs', { params })
      return res.data
    },
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.data?.some((l: OdkSyncLog) => l.status === 'running')
      return hasRunning ? 3000 : false
    },
  })
}

export function useCreateOdkFormConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { form_id: string; form_name: string; form_version: string; field_mapping: Record<string, string> }) => {
      const res = await api.post<SingleResponse<OdkFormConfig>>('/partner/odk/form-configs', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: odkKeys.formConfigs() }),
  })
}

// Prefix key used for cache operations — matches all sync-log queries regardless of params
const SYNC_LOG_PREFIX = ['odk', 'sync-logs'] as const

export function useTriggerOdkSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form_id?: string) => {
      const res = await api.post<{ success: true; data: OdkSyncLog }>('/partner/odk/sync', { form_id })
      return res.data.data
    },
    onMutate: () => {
      // Inject optimistic "running" row immediately so the user sees feedback
      // while the sync runs inline on the server (~5 seconds).
      const optimisticLog: OdkSyncLog = {
        id: '__optimistic__',
        sync_started_at: new Date().toISOString(),
        sync_completed_at: null,
        status: 'running',
        trigger_type: 'manual',
        submissions_found: null,
        submissions_processed: null,
        submissions_failed: null,
        error_message: null,
        created_by: null,
      }
      // Use the 2-element prefix key so it prefix-matches all sync-log queries
      qc.setQueriesData(
        { queryKey: SYNC_LOG_PREFIX },
        (old: { data: OdkSyncLog[]; meta: unknown } | undefined) => {
          if (!old) return old
          return { ...old, data: [optimisticLog, ...old.data] }
        },
      )
    },
    onSuccess: (realLog) => {
      // Replace the optimistic row with the real result returned by the server
      qc.setQueriesData(
        { queryKey: SYNC_LOG_PREFIX },
        (old: { data: OdkSyncLog[]; meta: unknown } | undefined) => {
          if (!old) return old
          return {
            ...old,
            data: [realLog, ...old.data.filter((l: OdkSyncLog) => l.id !== '__optimistic__')],
          }
        },
      )
    },
    onError: () => {
      // Remove the optimistic row on error
      qc.setQueriesData(
        { queryKey: SYNC_LOG_PREFIX },
        (old: { data: OdkSyncLog[]; meta: unknown } | undefined) => {
          if (!old) return old
          return { ...old, data: old.data.filter((l: OdkSyncLog) => l.id !== '__optimistic__') }
        },
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SYNC_LOG_PREFIX }),
  })
}

// --- Partner Import Queries ---

export function useImportHistory(params: { partner_name?: PartnerName; page?: number; per_page?: number } = {}) {
  return useQuery({
    queryKey: importKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<PartnerLabImport>>('/partner/imports', { params })
      return res.data
    },
  })
}

export function useImportDetail(id: string | undefined) {
  return useQuery({
    queryKey: importKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await api.get<SingleResponse<PartnerLabImport & { results: PartnerLabResult[] }>>(`/partner/imports/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useImportPreview(id: string) {
  return useQuery({
    queryKey: importKeys.preview(id),
    queryFn: async () => {
      const res = await api.get(`/partner/imports/${id}/preview`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useUploadCsv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, partner_name }: { file: File; partner_name: PartnerName }) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post(
        `/partner/imports/upload?partner_name=${encodeURIComponent(partner_name)}`,
        formData,
      )
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: importKeys.lists() }),
  })
}

export function useExecuteImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (importId: string) => {
      const res = await api.post(`/partner/imports/${importId}/execute`)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: importKeys.lists() }),
  })
}

// --- Partner Results ---

export function usePartnerResultsList(params: {
  partner_name?: PartnerName
  match_status?: string
  test_name?: string
  page?: number
  per_page?: number
} = {}) {
  return useQuery({
    queryKey: partnerResultKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<PartnerLabResult>>('/partner/partner-results', { params })
      return res.data
    },
  })
}

export function usePartnerResults(participantId: string) {
  return useQuery({
    queryKey: partnerResultKeys.byParticipant(participantId),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: PartnerLabResult[] }>('/partner/partner-results', {
        params: { participant_id: participantId },
      })
      return res.data.data
    },
    enabled: !!participantId,
  })
}

// --- Canonical Tests ---

export function useCanonicalTests(params: { category?: string; search?: string } = {}) {
  return useQuery({
    queryKey: canonicalTestKeys.list(params),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: CanonicalTest[] }>('/partner/canonical-tests', { params })
      return res.data.data
    },
  })
}

export function useCreateCanonicalTest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { canonical_name: string; display_name?: string; category?: string; standard_unit?: string }) => {
      const res = await api.post<SingleResponse<CanonicalTest>>('/partner/canonical-tests', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: canonicalTestKeys.lists() }),
  })
}

export function useTestAliases(testId: string) {
  return useQuery({
    queryKey: canonicalTestKeys.aliases(testId),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: TestNameAlias[] }>(`/partner/canonical-tests/${testId}/aliases`)
      return res.data.data
    },
    enabled: !!testId,
  })
}

export function useCreateTestAlias(testId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { partner_name: PartnerName; alias_name: string; alias_unit?: string; unit_conversion_factor?: number }) => {
      const res = await api.post(`/partner/canonical-tests/${testId}/aliases`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: canonicalTestKeys.aliases(testId) })
      qc.invalidateQueries({ queryKey: canonicalTestKeys.lists() })
    },
  })
}

// --- Stool Kits ---

export function useStoolKits(params: { participant_id?: string; status?: StoolKitStatus; page?: number; per_page?: number } = {}) {
  return useQuery({
    queryKey: stoolKitKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<StoolKit>>('/partner/stool-kits', { params })
      return res.data
    },
  })
}

export function useIssueStoolKit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { participant_id: string; field_event_id?: string; kit_code?: string }) => {
      const res = await api.post<SingleResponse<StoolKit>>('/partner/stool-kits', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stoolKitKeys.lists() }),
  })
}

export function useUpdateStoolKit(kitId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { status: StoolKitStatus; decodeage_pickup_date?: string; notes?: string }) => {
      const res = await api.put<SingleResponse<StoolKit>>(`/partner/stool-kits/${kitId}`, data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stoolKitKeys.lists() }),
  })
}
