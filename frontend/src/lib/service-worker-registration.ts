/**
 * PWA Service Worker Registration (shell only).
 * Full offline logic (IndexedDB sync, event roster caching) will be
 * implemented in Phase 3 (Field Operations).
 */

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })
        console.log('SW registered:', registration.scope)
      } catch (error) {
        console.log('SW registration failed:', error)
      }
    })
  }
}
