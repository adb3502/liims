import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { create } from 'zustand'

// --- Toast types ---

export interface Toast {
  id: string
  title?: string
  description: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2, 9)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    // Auto-remove after duration
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, toast.duration ?? 5000)
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

export function toast(props: Omit<Toast, 'id'>) {
  useToastStore.getState().addToast(props)
}

// --- Toast UI ---

function ToastItem({
  toast: t,
  onClose,
}: {
  toast: Toast
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 shadow-lg transition-all',
        'animate-[slideIn_0.2s_ease-out]',
        t.variant === 'destructive' && 'border-destructive bg-destructive text-destructive-foreground',
        t.variant === 'success' && 'border-success bg-success text-white',
        (!t.variant || t.variant === 'default') && 'border-border bg-background text-foreground'
      )}
    >
      <div className="flex-1">
        {t.title && <div className="text-sm font-semibold">{t.title}</div>}
        <div className="text-sm opacity-90">{t.description}</div>
      </div>
      <button
        onClick={onClose}
        className="rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  )
}
