/**
 * TanStack Query hooks for managed file store operations.
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
  filename: string
  original_filename: string
  content_type: string
  file_size: number
  storage_path: string
  category: FileCategory
  uploaded_by: string | null
  associated_entity_type: string | null
  associated_entity_id: string | null
  checksum_sha256: string
  is_processed: boolean
  processing_notes: string | null
  created_at: string
  updated_at: string
}

export interface WatchDirectory {
  id: string
  directory_path: string
  category: FileCategory
  file_pattern: string
  auto_process: boolean
  is_active: boolean
  last_scan_at: string | null
  created_at: string
  updated_at: string
}

// --- Query Keys ---

export const fileKeys = {
  all: ['files'] as const,
  lists: () => [...fileKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...fileKeys.lists(), params] as const,
  detail: (id: string) => [...fileKeys.all, 'detail', id] as const,
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

export function useFileUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      file: File
      category?: FileCategory
      associated_entity_type?: string
      associated_entity_id?: string
    }) => {
      const formData = new FormData()
      formData.append('file', data.file)

      const params = new URLSearchParams()
      if (data.category) params.set('category', data.category)
      if (data.associated_entity_type) params.set('associated_entity_type', data.associated_entity_type)
      if (data.associated_entity_id) params.set('associated_entity_id', data.associated_entity_id)

      const res = await api.post<SingleResponse<ManagedFile>>(
        `/files/upload?${params.toString()}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.lists() }),
  })
}

export function useFileDownload() {
  return {
    download: (fileId: string, filename: string) => {
      // Use the api baseURL to construct the download URL
      const token = localStorage.getItem('access_token')
      const link = document.createElement('a')
      link.href = `/api/v1/files/${fileId}/download`
      link.download = filename
      // For authenticated download, use fetch + blob
      fetch(`/api/v1/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          link.href = url
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
        })
    },
  }
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

// --- Watch Directory Queries ---

export function useWatchDirectories(params: { page?: number; per_page?: number } = {}) {
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
      directory_path: string
      category?: FileCategory
      file_pattern?: string
      auto_process?: boolean
    }) => {
      const res = await api.post<SingleResponse<WatchDirectory>>('/files/watch-dirs', data)
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
