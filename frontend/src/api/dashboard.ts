/**
 * TanStack Query hooks for dashboard API endpoints.
 */

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

// --- Types ---

export interface DemographicStats {
  by_age_group: Array<{ age_group: string; count: number }>
  by_sex: Array<{ sex: string; count: number }>
  by_age_sex: Array<{ age_group: string; sex: string; count: number }>
}

export interface EnrollmentStats {
  total_participants: number
  by_site: Array<{ site_name: string; site_code: string; count: number }>
  by_wave: Array<{ wave: number; count: number }>
  enrollment_rate_30d: Array<{ date: string; count: number }>
  recent_30d: number
  demographics?: DemographicStats
}

export interface InventoryStats {
  total_samples: number
  by_type: Array<{ sample_type: string; count: number }>
  by_status: Array<{ status: string; count: number }>
  freezer_utilization: Array<{
    freezer_id: string
    freezer_name: string
    used: number
    capacity: number
    utilization_pct: number
  }>
}

export interface FieldOpsStats {
  events_by_status: Array<{ status: string; count: number }>
  checkin_rates: { total_expected: number; checked_in: number; rate: number }
  upcoming_events: Array<{
    id: string
    event_name: string
    site_name: string
    event_date: string
    status: string
  }>
}

export interface InstrumentStats {
  runs_by_status: Array<{ status: string; count: number }>
  runs_by_type: Array<{ run_type: string; count: number }>
  recent_runs: Array<{
    id: string
    run_name: string
    instrument_name: string
    status: string
    started_at: string | null
  }>
}

export interface QualityStats {
  qc_pass_fail: { passed: number; failed: number; pending: number }
  icc_completion: Array<{ status: string; count: number }>
  omics_coverage: {
    total_participants: number
    proteomics_count: number
    metabolomics_count: number
  }
}

export interface EnrollmentMatrixCell {
  count: number
  target: number
}

export interface EnrollmentMatrixSite {
  code: string
  name: string
}

export interface EnrollmentMatrixStats {
  sites: EnrollmentMatrixSite[]
  group_codes: string[]
  matrix: Record<string, Record<string, EnrollmentMatrixCell>>
  totals: {
    by_site: Record<string, { count: number; target: number }>
    by_group: Record<string, { count: number; target: number }>
    grand: { count: number; target: number }
  }
}

export interface DashboardOverview {
  enrollment: { total: number; recent_30d: number }
  samples: { total: number; in_storage: number }
  storage: { utilization_pct: number }
  field_ops: { upcoming_count: number; completion_rate: number }
  instruments: { active_runs: number }
  quality: { qc_pass_rate: number }
}

// --- Query Keys ---

export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: () => [...dashboardKeys.all, 'overview'] as const,
  enrollment: () => [...dashboardKeys.all, 'enrollment'] as const,
  enrollmentMatrix: () => [...dashboardKeys.all, 'enrollment-matrix'] as const,
  inventory: () => [...dashboardKeys.all, 'inventory'] as const,
  fieldOps: () => [...dashboardKeys.all, 'field-ops'] as const,
  instruments: () => [...dashboardKeys.all, 'instruments'] as const,
  quality: () => [...dashboardKeys.all, 'quality'] as const,
}

// --- Hooks ---

export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: DashboardOverview }>('/dashboard/overview')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardEnrollment() {
  return useQuery({
    queryKey: dashboardKeys.enrollment(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: EnrollmentStats }>('/dashboard/enrollment')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardEnrollmentMatrix() {
  return useQuery({
    queryKey: dashboardKeys.enrollmentMatrix(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: EnrollmentMatrixStats }>('/dashboard/enrollment-matrix')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardInventory() {
  return useQuery({
    queryKey: dashboardKeys.inventory(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: InventoryStats }>('/dashboard/inventory')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardFieldOps() {
  return useQuery({
    queryKey: dashboardKeys.fieldOps(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: FieldOpsStats }>('/dashboard/field-ops')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardInstruments() {
  return useQuery({
    queryKey: dashboardKeys.instruments(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: InstrumentStats }>('/dashboard/instruments')
      return res.data.data
    },
    staleTime: 60_000,
  })
}

export function useDashboardQuality() {
  return useQuery({
    queryKey: dashboardKeys.quality(),
    queryFn: async () => {
      const res = await api.get<{ success: true; data: QualityStats }>('/dashboard/quality')
      return res.data.data
    },
    staleTime: 60_000,
  })
}
