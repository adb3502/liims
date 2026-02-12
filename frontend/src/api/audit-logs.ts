/**
 * TanStack Query hooks for audit log API calls.
 */

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { AuditLog, PaginatedResponse } from '@/types'

// --- Query keys ---

export const auditLogKeys = {
  all: ['audit-logs'] as const,
  lists: () => [...auditLogKeys.all, 'list'] as const,
  list: (params: Record<string, unknown>) =>
    [...auditLogKeys.lists(), params] as const,
}

// --- Audit log list params ---

export interface AuditLogListParams {
  page?: number
  per_page?: number
  user_id?: string
  action?: string
  entity_type?: string
  entity_id?: string
  date_from?: string
  date_to?: string
  search?: string
}

// --- Extended audit log with user info ---

export interface AuditLogWithUser extends AuditLog {
  user_email?: string
  user_full_name?: string
  additional_context?: Record<string, unknown> | null
}

// --- Hooks ---

export function useAuditLogs(params: AuditLogListParams = {}) {
  return useQuery({
    queryKey: auditLogKeys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v != null && v !== '')
      )
      const response = await api.get<PaginatedResponse<AuditLogWithUser>>(
        '/audit-logs',
        { params: cleanParams }
      )
      return response.data
    },
  })
}
