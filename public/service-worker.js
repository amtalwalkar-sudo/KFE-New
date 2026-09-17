// KFE PWA infrastructure boundary. The service worker never imports application/domain/UI code.
const CACHE_NAME = 'kfe-pwa-shell-v2'

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png']))
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
  event.respondWith(networkFirst(event.request))
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    return (await caches.match(request)) || (await caches.match('./index.html'))
  }
}
