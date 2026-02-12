/**
 * TanStack Query hooks for report generation API endpoints.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { extractErrorMessage } from '@/lib/api'
import type { PaginatedResponse, SingleResponse } from '@/types'

// --- Types ---

export interface ReportType {
  report_type: string
  label: string
  description: string
  filters: string[]
}

export interface GenerateReportParams {
  report_type: string
  site_id?: string
  wave?: number
  date_from?: string
  date_to?: string
  sample_type?: string
  sample_status?: string
  event_status?: string
}

export type ScheduledReportType = 'enrollment_summary' | 'inventory_summary' | 'quality_summary' | 'compliance'

export interface ScheduledReport {
  id: string
  name: string
  report_type: ScheduledReportType
  schedule_cron: string
  recipients: string[]
  is_active: boolean
  last_generated_at: string | null
  created_at: string
  created_by: string
}

export interface ScheduledReportCreate {
  name: string
  report_type: ScheduledReportType
  schedule_cron: string
  recipients: string[]
  is_active?: boolean
}

export interface ScheduledReportUpdate {
  name?: string
  schedule_cron?: string
  recipients?: string[]
  is_active?: boolean
}

// --- Query Keys ---

export const reportKeys = {
  all: ['reports'] as const,
  types: () => [...reportKeys.all, 'types'] as const,
  scheduled: () => [...reportKeys.all, 'scheduled'] as const,
  scheduledDetail: (id: string) => [...reportKeys.scheduled(), id] as const,
}

// --- Hooks ---

export function useReportTypes() {
  return useQuery({
    queryKey: reportKeys.types(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ReportType[] }>('/reports/types')
      return res.data.data
    },
    staleTime: 300_000,
  })
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: async (params: GenerateReportParams) => {
      const res = await api.post('/reports/generate', params, {
        responseType: 'blob',
      })
      // Trigger file download
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const disposition = res.headers['content-disposition']
      const filename = disposition
        ? disposition.split('filename=')[1]?.replace(/"/g, '') ?? `${params.report_type}_report.csv`
        : `${params.report_type}_report.csv`
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    },
    onSuccess: () => {
      toast({ description: 'Report downloaded successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

// --- Scheduled Reports ---

export function useScheduledReports() {
  return useQuery({
    queryKey: reportKeys.scheduled(),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<ScheduledReport>>('/reports/scheduled')
      return res.data
    },
  })
}

export function useCreateScheduledReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ScheduledReportCreate) => {
      const res = await api.post<SingleResponse<ScheduledReport>>('/reports/scheduled', data)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.scheduled() })
      toast({ description: 'Scheduled report created successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useUpdateScheduledReport(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ScheduledReportUpdate) => {
      const res = await api.put<SingleResponse<ScheduledReport>>(`/reports/scheduled/${id}`, data)
      return res.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.scheduled() })
      toast({ description: 'Scheduled report updated successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useDeleteScheduledReport(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await api.delete(`/reports/scheduled/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportKeys.scheduled() })
      toast({ description: 'Scheduled report deleted successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
