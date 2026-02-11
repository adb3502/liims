import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ErrorResponse } from '@/types'

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Token management ---

const TOKEN_KEY = 'access_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// --- Silent token refresh ---

let refreshPromise: Promise<string> | null = null

async function refreshToken(): Promise<string> {
  const response = await axios.post('/api/v1/auth/refresh', null, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
  const newToken = response.data.data.access_token
  setToken(newToken)
  return newToken
}

async function silentRefresh(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// --- Request interceptor ---

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// --- Response interceptor ---

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorResponse>) => {
    const originalRequest = error.config
    if (!originalRequest) return Promise.reject(error)

    // Attempt silent refresh on 401 (not for login or refresh endpoints)
    if (
      error.response?.status === 401 &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !(originalRequest as Record<string, unknown>)._retry
    ) {
      ;(originalRequest as Record<string, unknown>)._retry = true
      try {
        const newToken = await silentRefresh()
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch {
        clearToken()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

// --- Error extraction helper ---

export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ErrorResponse | undefined
    if (data?.error?.message) {
      return data.error.message
    }
    if (error.response?.status === 403) {
      return 'You do not have permission to perform this action.'
    }
    if (error.response?.status === 404) {
      return 'The requested resource was not found.'
    }
    if (error.response?.status === 422) {
      return 'Please check the form for errors and try again.'
    }
    if (error.response?.status && error.response.status >= 500) {
      return 'Something went wrong on our end. Please try again later.'
    }
    if (!error.response) {
      return 'Unable to connect to the server. Please check your network.'
    }
  }
  return 'An unexpected error occurred. Please try again.'
}

// --- Refresh timer ---
// Starts a background timer to silently refresh tokens before expiry

let refreshInterval: ReturnType<typeof setInterval> | null = null

export function startTokenRefreshTimer(): void {
  stopTokenRefreshTimer()
  // Refresh every 20 minutes (token expires at 24h, this keeps it fresh)
  refreshInterval = setInterval(
    async () => {
      const token = getToken()
      if (token) {
        try {
          await silentRefresh()
        } catch {
          // Refresh failed, user will be redirected on next API call
        }
      }
    },
    20 * 60 * 1000
  )
}

export function stopTokenRefreshTimer(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

export default api
