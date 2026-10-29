import assert from 'node:assert/strict'
import { LocalityResolutionService } from '../application/location/locationNameService.js'

const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const values = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  },
})

try {
  const cacheKey = 'kfe:locality-cache:v2'
  const coordinateKey = '19.07600:72.87770'
  values.set(cacheKey, JSON.stringify({
    [coordinateKey]: { placeName: 'Stale incorrect area', provider: 'old-provider', resolvedAt: '2026-10-29T00:00:00.000Z' },
  }))

  const service = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => null },
    fallback: { resolve: async () => null },
  })
  const unresolved = await service.resolveDetailed({ latitude: 19.076, longitude: 72.8777 }, { forceRefresh: true })
  assert.equal(unresolved.placeName, null)
  assert.equal(unresolved.state, 'NO_LOCALITY_MATCH')
  assert.equal(JSON.parse(values.get(cacheKey))[coordinateKey], undefined,
    'a failed explicit refresh must remove an old locality label that may be incorrect')

  const replacement = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => 'Verified area, Mumbai, Maharashtra' },
    fallback: { resolve: async () => null },
  })
  const resolved = await replacement.resolveDetailed({ latitude: 19.076, longitude: 72.8777 }, { forceRefresh: true })
  assert.equal(resolved.placeName, 'Verified area, Mumbai, Maharashtra')
  assert.equal(resolved.state, 'RESOLVED')
  assert.equal(JSON.parse(values.get(cacheKey))[coordinateKey].placeName, 'Verified area, Mumbai, Maharashtra')

  const offlineStyleFailure = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => { throw new Error('network unavailable') } },
    fallback: { resolve: async () => { throw new Error('network unavailable') } },
  })
  const failed = await offlineStyleFailure.resolveDetailed({ latitude: 19.076, longitude: 72.8777 }, { forceRefresh: true })
  assert.equal(failed.placeName, null)
  assert.equal(failed.state, 'PROVIDER_UNAVAILABLE')
  assert.doesNotMatch(JSON.stringify(failed), /RETRY_SCHEDULED/,
    'manual-only resolution must not claim an automatic retry has been scheduled')
} finally {
  if (previousDescriptor) Object.defineProperty(globalThis, 'localStorage', previousDescriptor)
  else delete globalThis.localStorage
}

console.log('Locality resolution contract: manual refresh cannot preserve stale labels or schedule automatic retries.')
