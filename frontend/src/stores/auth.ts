import { create } from 'zustand'
import api, {
  getToken,
  setToken,
  clearToken,
  extractErrorMessage,
  startTokenRefreshTimer,
  stopTokenRefreshTimer,
} from '@/lib/api'
import type { User, LoginRequest, LoginResponse } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (credentials: LoginRequest) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.post<{ success: true; data: LoginResponse }>(
        '/auth/login',
        credentials
      )
      const { access_token, user } = response.data.data
      setToken(access_token)
      startTokenRefreshTimer()
      set({ user, isAuthenticated: true, isLoading: false, error: null })
    } catch (error) {
      set({ isLoading: false, error: extractErrorMessage(error) })
      throw error
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Logout best-effort
    } finally {
      clearToken()
      stopTokenRefreshTimer()
      set({ user: null, isAuthenticated: false, isLoading: false, error: null })
    }
  },

  checkAuth: async () => {
    const token = getToken()
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false })
      return
    }
    try {
      const response = await api.get<{ success: true; data: User }>('/auth/me')
      startTokenRefreshTimer()
      set({
        user: response.data.data,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      clearToken()
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))
