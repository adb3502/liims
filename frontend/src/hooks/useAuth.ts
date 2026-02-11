import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types'

/**
 * Convenience hook for auth-related checks in components.
 */
export function useAuth() {
  const { user, isAuthenticated, isLoading } = useAuthStore()

  function hasRole(...roles: UserRole[]): boolean {
    if (!user) return false
    return roles.includes(user.role)
  }

  function isAdmin(): boolean {
    return hasRole('super_admin', 'lab_manager')
  }

  return {
    user,
    isAuthenticated,
    isLoading,
    hasRole,
    isAdmin,
  }
}
