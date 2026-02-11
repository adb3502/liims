/**
 * TanStack Query hooks for managed file store operations.
 *
 * Files live on the NAS -- only metadata is exposed via API.
 * File content is never served to the browser.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import type { PaginatedResponse, SingleResponse } from '@/types'

// --- Types ---

export type FileCategory =
  | 'instrument_output'
  | 'partner_data'
  | 'icc_image'
  | 'report'
  | 'omics_data'
  | 'other'

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  instrument_output: 'Instrument Output',
  partner_data: 'Partner Data',
  icc_image: 'ICC Image',
  report: 'Report',
  omics_data: 'Omics Data',
  other: 'Other',
}

export interface ManagedFile {
  id: string
  file_path: string
  file_name: string
  file_size: number
  mime_type: string
  checksum_sha256: string
  category: FileCategory
  instrument_id: string | null
  discovered_at: string
  processed: boolean
  processed_at: string | null
  entity_type: string | null
  entity_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WatchDirectory {
  id: string
  path: string
  instrument_id: string | null
  file_pattern: string
  category: FileCategory
  is_active: boolean
  last_scanned_at: string | null
  created_at: string
  updated_at: string
}

export interface FileIntegrityResult {
  file_id: string
  file_path?: string
  stored_checksum?: string
  current_checksum?: string | null
  match?: boolean
  error?: string | null
}

// --- Query Keys ---

export const fileKeys = {
  all: ['files'] as const,
  lists: () => [...fileKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...fileKeys.lists(), params] as const,
  detail: (id: string) => [...fileKeys.all, 'detail', id] as const,
  entity: (type: string, id: string) => [...fileKeys.all, 'entity', type, id] as const,
}

export const watchDirKeys = {
  all: ['watch-dirs'] as const,
  lists: () => [...watchDirKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...watchDirKeys.lists(), params] as const,
}

// --- File Queries ---

export function useFiles(params: {
  search?: string
  category?: FileCategory
  instrument_id?: string
  associated_entity_type?: string
  associated_entity_id?: string
  page?: number
  per_page?: number
  sort?: string
  order?: 'asc' | 'desc'
} = {}) {
  return useQuery({
    queryKey: fileKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const res = await api.get<PaginatedResponse<ManagedFile>>('/files', { params: cleanParams })
      return res.data
    },
  })
}

export function useFile(id: string) {
  return useQuery({
    queryKey: fileKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<SingleResponse<ManagedFile>>(`/files/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useFilesForEntity(entityType: string, entityId: string) {
  return useQuery({
    queryKey: fileKeys.entity(entityType, entityId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ManagedFile[] }>(
        `/files/entity/${entityType}/${entityId}`,
      )
      return res.data.data
    },
    enabled: !!entityType && !!entityId,
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await api.delete<SingleResponse<ManagedFile>>(`/files/${fileId}`)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.lists() }),
  })
}

export function useAssociateFile(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { associated_entity_type: string; associated_entity_id: string }) => {
      const res = await api.post<SingleResponse<ManagedFile>>(`/files/${fileId}/associate`, data)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fileKeys.detail(fileId) })
      qc.invalidateQueries({ queryKey: fileKeys.lists() })
    },
  })
}

export function useVerifyFileIntegrity() {
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await api.post<{ success: boolean; data: FileIntegrityResult }>(
        `/files/verify/${fileId}`,
      )
      return res.data.data
    },
  })
}

// --- Watch Directory Queries ---

export function useWatchDirectories(params: {
  page?: number
  per_page?: number
  include_inactive?: boolean
} = {}) {
  return useQuery({
    queryKey: watchDirKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<WatchDirectory>>('/files/watch-dirs', { params })
      return res.data
    },
  })
}

export function useCreateWatchDirectory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      path: string
      instrument_id?: string
      category?: FileCategory
      file_pattern?: string
    }) => {
      const res = await api.post<SingleResponse<WatchDirectory>>('/files/watch-dirs', data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: watchDirKeys.lists() }),
  })
}

export function useUpdateWatchDirectory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string
      instrument_id?: string | null
      file_pattern?: string
      category?: FileCategory
      is_active?: boolean
    }) => {
      const res = await api.patch<SingleResponse<WatchDirectory>>(`/files/watch-dirs/${id}`, data)
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: watchDirKeys.lists() }),
  })
}

export function useScanWatchDirectory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (watchDirId: string) => {
      const res = await api.post<{ success: boolean; data: ManagedFile[]; meta: { files_ingested: number } }>(
        `/files/watch-dirs/${watchDirId}/scan`,
      )
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: fileKeys.lists() })
      qc.invalidateQueries({ queryKey: watchDirKeys.lists() })
    },
  })
}
