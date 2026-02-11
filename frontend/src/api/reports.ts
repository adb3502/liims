/**
 * TanStack Query hooks for report generation API endpoints.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { extractErrorMessage } from '@/lib/api'

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

// --- Query Keys ---

export const reportKeys = {
  all: ['reports'] as const,
  types: () => [...reportKeys.all, 'types'] as const,
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
