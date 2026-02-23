/**
 * TanStack Query hooks for BHARAT Data Explorer endpoints.
 */

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// ── Types ──

export interface ParameterMeta {
  key: string
  label: string
  unit: string
  category: string
  normal_range?: { min: number; max: number }
}

export interface DistributionPoint {
  value: number
  group: string
}

export interface DistributionBin {
  bin_start: number
  bin_end: number
  count: number
  group: string
}

export interface DistributionResponse {
  parameter: string
  label: string
  unit: string
  chart_type: 'box' | 'histogram'
  groups: Array<{
    group: string
    label: string
    n: number
    mean: number
    median: number
    sd: number
    q1: number
    q3: number
    min: number
    max: number
    values?: number[]
    bins?: DistributionBin[]
  }>
}

export interface CorrelationCell {
  param_x: string
  param_y: string
  label_x: string
  label_y: string
  r: number
  p_value: number
  n: number
}

export interface CorrelationResponse {
  method: 'spearman' | 'pearson'
  parameters: string[]
  labels: string[]
  matrix: CorrelationCell[][]
  n_participants: number
}

export interface ClinicalSummaryItem {
  category: string
  label: string
  mean?: number
  median?: number
  sd?: number
  unit?: string
  prevalence_pct?: number
  count?: number
  total?: number
  type: 'continuous' | 'binary'
}

export interface ClinicalSummaryResponse {
  n_participants: number
  sections: Array<{
    section: string
    items: ClinicalSummaryItem[]
  }>
}

// ── Filter params ──

export interface DataExplorerFilters {
  age_groups?: string[]
  sex?: string[]
  site_ids?: string[]
}

// ── Query Keys ──

export const dataExplorerKeys = {
  all: ['data-explorer'] as const,
  parameters: () => [...dataExplorerKeys.all, 'parameters'] as const,
  distribution: (parameter: string, chartType: string, groupBy: string, filters: DataExplorerFilters) =>
    [...dataExplorerKeys.all, 'distribution', parameter, chartType, groupBy, filters] as const,
  correlation: (parameters: string[], method: string, filters: DataExplorerFilters) =>
    [...dataExplorerKeys.all, 'correlation', parameters.join(','), method, filters] as const,
  clinicalSummary: (filters: DataExplorerFilters) =>
    [...dataExplorerKeys.all, 'clinical-summary', filters] as const,
}

// ── Hooks ──

export function useDataExplorerParameters() {
  return useQuery({
    queryKey: dataExplorerKeys.parameters(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: ParameterMeta[] }>('/data-explorer/parameters')
      return res.data.data
    },
    staleTime: 5 * 60_000, // parameters don't change often
  })
}

export function useDataExplorerDistribution(
  parameter: string,
  chartType: 'box' | 'histogram',
  groupBy: 'age_group' | 'sex' | 'site',
  filters: DataExplorerFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: dataExplorerKeys.distribution(parameter, chartType, groupBy, filters),
    queryFn: async () => {
      const params: Record<string, string> = {
        parameter,
        chart_type: chartType,
        group_by: groupBy,
      }
      if (filters.age_groups?.length) params.age_groups = filters.age_groups.join(',')
      if (filters.sex?.length) params.sex = filters.sex.join(',')
      if (filters.site_ids?.length) params.site_ids = filters.site_ids.join(',')
      const res = await api.get<{ success: true; data: DistributionResponse }>('/data-explorer/distribution', { params })
      return res.data.data
    },
    enabled: enabled && !!parameter,
    staleTime: 60_000,
  })
}

export function useDataExplorerCorrelation(
  parameters: string[],
  method: 'spearman' | 'pearson',
  filters: DataExplorerFilters,
  enabled = true,
) {
  return useQuery({
    queryKey: dataExplorerKeys.correlation(parameters, method, filters),
    queryFn: async () => {
      const params: Record<string, string> = {
        parameters: parameters.join(','),
        method,
      }
      if (filters.age_groups?.length) params.age_groups = filters.age_groups.join(',')
      if (filters.sex?.length) params.sex = filters.sex.join(',')
      if (filters.site_ids?.length) params.site_ids = filters.site_ids.join(',')
      const res = await api.get<{ success: true; data: CorrelationResponse }>('/data-explorer/correlation', { params })
      return res.data.data
    },
    enabled: enabled && parameters.length >= 2,
    staleTime: 60_000,
  })
}

export function useDataExplorerClinicalSummary(filters: DataExplorerFilters) {
  return useQuery({
    queryKey: dataExplorerKeys.clinicalSummary(filters),
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters.age_groups?.length) params.age_groups = filters.age_groups.join(',')
      if (filters.sex?.length) params.sex = filters.sex.join(',')
      if (filters.site_ids?.length) params.site_ids = filters.site_ids.join(',')
      const res = await api.get<{ success: true; data: ClinicalSummaryResponse }>('/data-explorer/clinical-summary', { params })
      return res.data.data
    },
    staleTime: 60_000,
  })
}
