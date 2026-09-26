// KFE PWA infrastructure boundary. The service worker never imports application/domain/UI code.
const CACHE_NAME = 'kfe-pwa-shell-v6'
const SHELL_ASSETS = ['./', './index.html', './manifest.json']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', event => {
  if (event.data?.type === 'kfe:activate-update') self.skipWaiting()
})

self.addEventListener('sync', event => {
  if (event.tag === 'kfe-outbox-retry') event.waitUntil(notifyClients('kfe:outbox-retry'))
})

self.addEventListener('periodicsync', event => {
  if (event.tag === 'kfe-daily-cloud-backup') event.waitUntil(notifyClients('kfe:daily-cloud-backup'))
})

async function notifyClients(type) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  clients.forEach(client => client.postMessage({ type }))
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== location.origin) return
  event.respondWith(handleRequest(event.request))
})

const isStaticAsset = request => {
  const url = new URL(request.url)
  return url.pathname.includes('/assets/') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/icon-192.png') ||
    url.pathname.endsWith('/icon-512.png') ||
    url.pathname.endsWith('/service-worker.js')
}

const shellResponse = () => caches.match('./index.html')

async function handleRequest(request) {
  try {
    const response = await fetch(request)

    // GitHub Pages is static hosting: a Vue history-mode route such as
    // /KFE-New/performance can return HTTP 404 on a hard refresh. Once the
    // PWA service worker controls the page, turn that server miss into the
    // cached application shell so Vue Router can resolve the route client-side.
    if (request.mode === 'navigate' && !response.ok) {
      const shell = await shellResponse()
      if (shell) return shell
    }

    if (response.ok && isStaticAsset(request)) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    if (request.mode === 'navigate') {
      const shell = await shellResponse()
      if (shell) return shell
      return new Response('KFE is offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    if (isStaticAsset(request)) {
      const cached = await caches.match(request)
      if (cached) return cached
    }
    return new Response('', { status: 504, statusText: 'Gateway Timeout' })
  }
}
