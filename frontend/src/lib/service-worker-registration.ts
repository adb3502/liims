/**
 * PWA Service Worker Registration with update handling.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return

  // Register in production, or if explicitly enabled in dev
  if (!import.meta.env.PROD && !import.meta.env.VITE_SW_DEV) return

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })

      // Check for updates periodically (every 60 minutes)
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)

      // Handle waiting service worker (new version available)
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (
            newWorker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            // New version available - activate immediately
            newWorker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // Reload when new service worker takes over
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true
          window.location.reload()
        }
      })

      console.log('SW registered:', registration.scope)
    } catch (error) {
      console.log('SW registration failed:', error)
    }
  })
}
