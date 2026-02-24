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
  // Present when backend applied BH multiple-comparison correction
  multiple_comparison_note?: string
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
      const res = await api.get<{ success: true; data: Array<{ name: string; display_name: string; category: string | null; source: string; unit: string | null }> }>('/data-explorer/parameters')
      // Map backend field names to frontend ParameterMeta shape
      return res.data.data.map((p): ParameterMeta => ({
        key: p.name,
        label: p.display_name || p.name,
        unit: p.unit || '',
        category: p.category || p.source || 'Other',
      }))
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
      const params: Record<string, string> = { parameter, group_by: groupBy }
      if (filters.age_groups?.length) params.age_group = filters.age_groups.join(',')
      if (filters.sex?.length) params.sex = filters.sex.join(',')
      const res = await api.get<{
        success: true;
        data: {
          parameter: string;
          unit: string | null;
          stats: { n: number; mean: number | null; median: number | null; sd: number | null; min: number | null; max: number | null; q1: number | null; q3: number | null };
          groups?: Array<{
            group: string; label: string; n: number;
            mean: number; median: number; sd: number;
            q1: number; q3: number; min: number; max: number;
            values: number[];
          }>;
          data?: Array<{ value: number; age_group: number; sex: string; site_code: string | null; participant_code: string }>;
        }
      }>('/data-explorer/distribution', { params })
      const raw = res.data.data
      // If backend returned server-side grouped data, use it directly
      if (raw.groups && raw.groups.length > 0) {
        return {
          parameter: raw.parameter,
          label: parameter,
          unit: raw.unit || '',
          chart_type: chartType,
          groups: raw.groups,
        } as DistributionResponse
      }
      // Fallback: client-side grouping for backward compatibility
      const groupMap = new Map<string, number[]>()
      for (const pt of (raw.data ?? [])) {
        let gKey: string
        if (groupBy === 'age_group') gKey = String(pt.age_group)
        else if (groupBy === 'sex') gKey = pt.sex
        else gKey = pt.site_code || 'Unknown'
        const arr = groupMap.get(gKey) ?? []
        arr.push(pt.value)
        groupMap.set(gKey, arr)
      }
      const groups = Array.from(groupMap.entries()).map(([group, values]) => {
        const sorted = [...values].sort((a, b) => a - b)
        const n = sorted.length
        const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0
        const pctl = (p: number) => { const k = (n - 1) * p; const f = Math.floor(k); return sorted[f] + (k - f) * ((sorted[f + 1] ?? sorted[f]) - sorted[f]) }
        return {
          group, label: group, n,
          mean: Math.round(mean * 100) / 100,
          median: n > 0 ? Math.round(pctl(0.5) * 100) / 100 : 0,
          sd: n > 1 ? Math.round(Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) * 100) / 100 : 0,
          q1: n > 0 ? Math.round(pctl(0.25) * 100) / 100 : 0,
          q3: n > 0 ? Math.round(pctl(0.75) * 100) / 100 : 0,
          min: sorted[0] ?? 0, max: sorted[n - 1] ?? 0,
          values,
        }
      })
      return { parameter: raw.parameter, label: parameter, unit: raw.unit || '', chart_type: chartType, groups } as DistributionResponse
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
      if (filters.age_groups?.length) params.age_group = filters.age_groups.join(',')
      if (filters.sex?.length) params.sex = filters.sex.join(',')
      const res = await api.get<{
        success: true;
        data: {
          method: string; parameters: string[]; matrix: (number | null)[][];
          p_values: (number | null)[][]; adjusted_p_values?: (number | null)[][];
          multiple_comparison_note?: string; n_observations?: number;
        }
      }>('/data-explorer/correlation', { params })
      const raw = res.data.data
      // Transform to CorrelationResponse — prefer adjusted p-values if available
      const pMatrix = raw.adjusted_p_values ?? raw.p_values
      const cells: CorrelationCell[][] = raw.matrix.map((row, i) =>
        row.map((r, j) => ({
          param_x: raw.parameters[i],
          param_y: raw.parameters[j],
          label_x: raw.parameters[i],
          label_y: raw.parameters[j],
          r: r ?? 0,
          p_value: pMatrix[i]?.[j] ?? 1,
          n: raw.n_observations ?? 0,
        }))
      )
      return {
        method: raw.method as 'spearman' | 'pearson',
        parameters: raw.parameters,
        labels: raw.parameters,
        matrix: cells,
        n_participants: raw.n_observations ?? 0,
        multiple_comparison_note: raw.multiple_comparison_note,
      } as CorrelationResponse
    },
    enabled: enabled && parameters.length >= 2,
    staleTime: 60_000,
  })
}

export function useDataExplorerClinicalSummary(filters: DataExplorerFilters) {
  return useQuery({
    queryKey: dataExplorerKeys.clinicalSummary(filters),
    queryFn: async () => {
      const res = await api.get<{
        success: true;
        data: {
          vitals: Record<string, { mean: number | null; median: number | null; sd: number | null; n: number }>;
          anthropometry: Record<string, { mean: number | null; median: number | null; sd: number | null; n: number }>;
          scores: Record<string, { mean: number | null; median: number | null; sd: number | null; n: number }>;
          comorbidities: Record<string, number>;
        }
      }>('/data-explorer/clinical-summary')
      const raw = res.data.data
      const LABELS: Record<string, string> = {
        bp_sbp: 'Systolic BP', bp_dbp: 'Diastolic BP', pulse: 'Pulse', spo2: 'SpO2', temperature: 'Temperature',
        height_cm: 'Height', weight_kg: 'Weight', bmi: 'BMI',
        dass_depression: 'DASS Depression', dass_anxiety: 'DASS Anxiety', dass_stress: 'DASS Stress',
        mmse_total: 'MMSE Total', frail_score: 'FRAIL Score', who_qol: 'WHO QoL',
      }
      const UNITS: Record<string, string> = {
        bp_sbp: 'mmHg', bp_dbp: 'mmHg', pulse: 'bpm', spo2: '%', temperature: '°C',
        height_cm: 'cm', weight_kg: 'kg', bmi: 'kg/m²',
      }
      const sections: ClinicalSummaryResponse['sections'] = []
      const mapSection = (name: string, data: Record<string, { mean: number | null; median: number | null; sd: number | null; n: number }>) => {
        const items: ClinicalSummaryItem[] = Object.entries(data).map(([key, stat]) => ({
          category: name, label: LABELS[key] || key, mean: stat.mean ?? undefined, median: stat.median ?? undefined, sd: stat.sd ?? undefined,
          unit: UNITS[key], type: 'continuous' as const, count: stat.n, total: stat.n,
        }))
        if (items.length) sections.push({ section: name, items })
      }
      mapSection('Vitals', raw.vitals)
      mapSection('Anthropometry', raw.anthropometry)
      mapSection('Scores', raw.scores)
      // Comorbidities as binary items
      const comorbItems: ClinicalSummaryItem[] = Object.entries(raw.comorbidities).map(([key, count]) => ({
        category: 'Comorbidities', label: key.toUpperCase(), type: 'binary' as const, count, total: 0,
        prevalence_pct: 0,
      }))
      if (comorbItems.length) sections.push({ section: 'Comorbidities', items: comorbItems })
      const totalN = Object.values(raw.vitals)[0]?.n ?? 0
      return { n_participants: totalN, sections } as ClinicalSummaryResponse
    },
    staleTime: 60_000,
  })
}
