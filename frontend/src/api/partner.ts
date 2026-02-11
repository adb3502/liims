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

export function useTriggerOdkSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (form_id?: string) => {
      const res = await api.post('/partner/odk/sync', { form_id })
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: odkKeys.syncLogs() }),
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

export function useImportDetail(id: string) {
  return useQuery({
    queryKey: importKeys.detail(id),
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
      formData.append('partner_name', partner_name)
      const res = await api.post('/partner/imports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
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
