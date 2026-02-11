/**
 * TanStack Query hooks for instrument, plate, run, and ICC operations.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type {
  Instrument,
  InstrumentCreate,
  InstrumentRun,
  InstrumentRunCreate,
  IccSlide,
  IccSlideCreate,
  Plate,
  PlateDetail,
  QCTemplate,
  RunDetail,
  PaginatedResponse,
  SingleResponse,
  RunType,
  RunStatus,
  IccStatus,
} from '@/types'

// --- Query Keys ---

export const instrumentKeys = {
  all: ['instruments'] as const,
  lists: () => [...instrumentKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...instrumentKeys.lists(), params] as const,
  detail: (id: string) => [...instrumentKeys.all, 'detail', id] as const,
}

export const plateKeys = {
  all: ['plates'] as const,
  lists: () => [...plateKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...plateKeys.lists(), params] as const,
  detail: (id: string) => [...plateKeys.all, 'detail', id] as const,
}

export const runKeys = {
  all: ['runs'] as const,
  lists: () => [...runKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...runKeys.lists(), params] as const,
  detail: (id: string) => [...runKeys.all, 'detail', id] as const,
}

export const qcTemplateKeys = {
  all: ['qc-templates'] as const,
  lists: () => [...qcTemplateKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...qcTemplateKeys.lists(), params] as const,
}

export const iccKeys = {
  all: ['icc'] as const,
  lists: () => [...iccKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...iccKeys.lists(), params] as const,
  detail: (id: string) => [...iccKeys.all, 'detail', id] as const,
}

// --- Instrument Queries ---

export function useInstruments(params: { is_active?: boolean; instrument_type?: string; page?: number; per_page?: number } = {}) {
  return useQuery({
    queryKey: instrumentKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Instrument>>('/instruments', { params })
      return res.data
    },
  })
}

export function useInstrument(id: string) {
  return useQuery({
    queryKey: instrumentKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<Instrument>>(`/instruments/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateInstrument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: InstrumentCreate) => {
      const res = await api.post<SingleResponse<Instrument>>('/instruments', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: instrumentKeys.lists() }),
  })
}

export function useUpdateInstrument(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<InstrumentCreate> & { is_active?: boolean }) => {
      const res = await api.put<SingleResponse<Instrument>>(`/instruments/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instrumentKeys.detail(id) })
      qc.invalidateQueries({ queryKey: instrumentKeys.lists() })
    },
  })
}

// --- QC Template Queries ---

export function useQCTemplates(params: { run_type?: RunType } = {}) {
  return useQuery({
    queryKey: qcTemplateKeys.list(params),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: QCTemplate[] }>('/instruments/plate-templates', { params })
      return res.data.data
    },
  })
}

export function useCreateQCTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; template_data: Record<string, unknown>; run_type?: RunType }) => {
      const res = await api.post<SingleResponse<QCTemplate>>('/instruments/plate-templates', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qcTemplateKeys.lists() }),
  })
}

// --- Plate Queries ---

export function usePlates(params: { run_id?: string; page?: number; per_page?: number } = {}) {
  return useQuery({
    queryKey: plateKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Plate>>('/instruments/plates', { params })
      return res.data
    },
  })
}

export function usePlateDetail(id: string) {
  return useQuery({
    queryKey: plateKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<PlateDetail>>(`/instruments/plates/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreatePlate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { plate_name: string; run_id?: string; qc_template_id?: string; rows?: number; columns?: number }) => {
      const res = await api.post<SingleResponse<PlateDetail>>('/instruments/plates', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: plateKeys.lists() }),
  })
}

export function useAssignWells(plateId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (assignments: Array<{ sample_id: string; well_position: string; is_qc_sample?: boolean; qc_type?: string }>) => {
      const res = await api.post(`/instruments/plates/${plateId}/assign-wells`, { assignments })
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plateKeys.detail(plateId) })
    },
  })
}

// --- Run Queries ---

export function useRuns(params: {
  instrument_id?: string
  run_type?: RunType
  status?: RunStatus
  page?: number
  per_page?: number
} = {}) {
  return useQuery({
    queryKey: runKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<InstrumentRun>>('/instruments/runs', { params })
      return res.data
    },
  })
}

export function useRunDetail(id: string) {
  return useQuery({
    queryKey: runKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<RunDetail>>(`/instruments/runs/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: InstrumentRunCreate) => {
      const res = await api.post<SingleResponse<InstrumentRun>>('/instruments/runs', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: runKeys.lists() }),
  })
}

export function useStartRun(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<SingleResponse<InstrumentRun>>(`/instruments/runs/${id}/start`)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.detail(id) })
      qc.invalidateQueries({ queryKey: runKeys.lists() })
    },
  })
}

export function useCompleteRun(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data?: { qc_status?: string; notes?: string }) => {
      const res = await api.post<SingleResponse<InstrumentRun>>(`/instruments/runs/${id}/complete`, data ?? {})
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.detail(id) })
      qc.invalidateQueries({ queryKey: runKeys.lists() })
    },
  })
}

export function useUploadRunResults(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { results: Array<{ sample_id: string; data: Record<string, unknown> }> }) => {
      const res = await api.post(`/instruments/runs/${id}/results`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: runKeys.detail(id) })
    },
  })
}

// --- ICC Queries ---

export function useIccSlides(params: { sample_id?: string; status?: IccStatus; page?: number; per_page?: number } = {}) {
  return useQuery({
    queryKey: iccKeys.list(params),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<IccSlide>>('/icc', { params })
      return res.data
    },
  })
}

export function useIccSlide(id: string) {
  return useQuery({
    queryKey: iccKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<IccSlide>>(`/icc/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateIccSlide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: IccSlideCreate) => {
      const res = await api.post<SingleResponse<IccSlide>>('/icc', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: iccKeys.lists() }),
  })
}

export function useUpdateIccSlide(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { status?: IccStatus; notes?: string; cell_counts?: Record<string, number> }) => {
      const res = await api.put<SingleResponse<IccSlide>>(`/icc/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: iccKeys.detail(id) })
      qc.invalidateQueries({ queryKey: iccKeys.lists() })
    },
  })
}

// --- Omics Types ---

export type OmicsResultType = 'proteomics' | 'metabolomics'

export interface OmicsResultSet {
  id: string
  run_id: string | null
  result_type: OmicsResultType
  analysis_software: string | null
  software_version: string | null
  import_date: string
  imported_by: string | null
  source_file_path: string | null
  total_features: number
  total_samples: number
  qc_summary: Record<string, unknown> | null
  notes: string | null
  created_at: string
  run_name?: string
}

export interface OmicsResult {
  id: string
  result_set_id: string
  sample_id: string
  feature_id: string
  feature_name: string | null
  quantification_value: number | null
  is_imputed: boolean
  confidence_score: number | null
  created_at: string
  sample_code?: string
}

// --- Omics Query Keys ---

export const omicsKeys = {
  all: ['omics'] as const,
  resultSets: (params?: Record<string, unknown>) => [...omicsKeys.all, 'result-sets', params] as const,
  resultSet: (id: string) => [...omicsKeys.all, 'result-set', id] as const,
  results: (params?: Record<string, unknown>) => [...omicsKeys.all, 'results', params] as const,
}

// --- Omics Queries ---

export function useOmicsResultSets(params: {
  result_type?: OmicsResultType
  run_id?: string
  page?: number
  per_page?: number
} = {}) {
  return useQuery({
    queryKey: omicsKeys.resultSets(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const res = await api.get<PaginatedResponse<OmicsResultSet>>('/instruments/omics-result-sets', { params: cleanParams })
      return res.data
    },
  })
}

export function useOmicsResultSet(id: string) {
  return useQuery({
    queryKey: omicsKeys.resultSet(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<OmicsResultSet>>(`/instruments/omics-result-sets/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useOmicsResults(params: {
  result_set_id?: string
  sample_id?: string
  participant_id?: string
  feature_id?: string
  page?: number
  per_page?: number
} = {}) {
  return useQuery({
    queryKey: omicsKeys.results(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const res = await api.get<PaginatedResponse<OmicsResult>>('/instruments/omics-results', { params: cleanParams })
      return res.data
    },
    enabled: !!params.result_set_id,
  })
}

export function useAdvanceIccStatus(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<SingleResponse<IccSlide>>(`/icc/${id}/advance`)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: iccKeys.detail(id) })
      qc.invalidateQueries({ queryKey: iccKeys.lists() })
    },
  })
}
