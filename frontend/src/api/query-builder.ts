/**
 * TanStack Query hooks for query builder API endpoints.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from '@/components/ui/toast'
import { extractErrorMessage } from '@/lib/api'

// --- Types ---

export interface QueryEntity {
  entity: string
  label: string
  fields: QueryField[]
}

export interface QueryField {
  name: string
  label: string
  type: 'string' | 'number' | 'date' | 'boolean' | 'uuid'
  operators: string[]
}

export interface QueryFilter {
  field: string
  operator: string
  value: string
}

export interface QueryRequest {
  entity: string
  filters: QueryFilter[]
  columns?: string[]
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page: number
  per_page: number
}

export interface QueryResultRow {
  [key: string]: unknown
}

export interface QueryResponse {
  columns: string[]
  rows: QueryResultRow[]
  total: number
  page: number
  per_page: number
}

// --- Query Keys ---

export const queryBuilderKeys = {
  all: ['query-builder'] as const,
  entities: () => [...queryBuilderKeys.all, 'entities'] as const,
}

// --- Hooks ---

export function useQueryEntities() {
  return useQuery({
    queryKey: queryBuilderKeys.entities(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: QueryEntity[] }>('/query-builder/entities')
      return res.data.data
    },
    staleTime: 300_000,
  })
}

export function useExecuteQuery() {
  return useMutation({
    mutationFn: async (params: QueryRequest) => {
      const res = await api.post<{ success: true; data: QueryResponse }>('/query-builder/execute', params)
      return res.data.data
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}

export function useExportQuery() {
  return useMutation({
    mutationFn: async (params: QueryRequest) => {
      const res = await api.post('/query-builder/export', params, {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${params.entity}_export.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    },
    onSuccess: () => {
      toast({ description: 'Query results exported successfully.', variant: 'success' })
    },
    onError: (error) => {
      toast({ description: extractErrorMessage(error), variant: 'destructive' })
    },
  })
}
