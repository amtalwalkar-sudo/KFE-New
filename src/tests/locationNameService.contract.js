import assert from 'node:assert/strict'
import { LocalityResolutionService, MapplsGatewayLocationNameAdapter, PhotonLocationNameAdapter, getCachedLocationName } from '../infrastructure/location/localityResolutionAdapter.js'

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
  const cacheKey = 'kfe:locality-cache:v3'
  const legacyCoordinateKey = '19.07500:72.87700'
  values.set('kfe:locality-cache:v2', JSON.stringify({
    [legacyCoordinateKey]: { placeName: 'Legacy incorrect area', provider: 'old-provider', resolvedAt: '2026-10-28T00:00:00.000Z' },
  }))
  assert.equal(getCachedLocationName({ latitude: 19.075, longitude: 72.877 }), null,
    'labels produced by the older locality parser must not remain visible after the quality-contract change')
  const coordinateKey = '19.07600:72.87770'
  values.set(cacheKey, JSON.stringify({
    [coordinateKey]: { placeName: 'Stale incorrect area', provider: 'old-provider', resolvedAt: '2026-10-29T00:00:00.000Z' },
  }))

  const service = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => null },
    fallback: { resolve: async () => null },
  })
  const unresolved = await service.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 10 }, { forceRefresh: true })
  assert.equal(unresolved.placeName, null)
  assert.equal(unresolved.state, 'NO_LOCALITY_MATCH')
  assert.equal(JSON.parse(values.get(cacheKey))[coordinateKey], undefined,
    'a failed explicit refresh must remove an old locality label that may be incorrect')

  const replacement = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => 'Verified area, Mumbai, Maharashtra' },
    fallback: { resolve: async () => null },
  })
  const resolved = await replacement.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 10 }, { forceRefresh: true })
  assert.equal(resolved.placeName, 'Verified area, Mumbai, Maharashtra')
  assert.equal(resolved.state, 'RESOLVED')
  assert.equal(JSON.parse(values.get(cacheKey))[coordinateKey].placeName, 'Verified area, Mumbai, Maharashtra')

  const lowAccuracyService = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => 'Unverified area' },
    fallback: { resolve: async () => 'Unverified fallback' },
  })
  const lowAccuracy = await lowAccuracyService.resolveDetailed(
    { latitude: 19.076, longitude: 72.8777, accuracy: 450 },
    { forceRefresh: true },
  )
  assert.equal(lowAccuracy.placeName, null)
  assert.equal(lowAccuracy.state, 'LOW_ACCURACY')
  assert.equal(getCachedLocationName({ latitude: 19.076, longitude: 72.8777, accuracy: 450 }), null)
  assert.equal(getCachedLocationName({ latitude: 19.076, longitude: 72.8777 }), null,
    'missing accuracy must not make an old locality label look reliable')

  const offlineStyleFailure = new LocalityResolutionService({
    primary: { endpoint: 'mock://primary', resolve: async () => { throw new Error('network unavailable') } },
    fallback: { resolve: async () => { throw new Error('network unavailable') } },
  })
  const failed = await offlineStyleFailure.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 10 }, { forceRefresh: true })
  assert.equal(failed.placeName, null)
  assert.equal(failed.state, 'PROVIDER_UNAVAILABLE')
  assert.doesNotMatch(JSON.stringify(failed), /RETRY_SCHEDULED/,
    'manual-only resolution must not claim an automatic retry has been scheduled')
} finally {
  if (previousDescriptor) Object.defineProperty(globalThis, 'localStorage', previousDescriptor)
  else delete globalThis.localStorage
}

const mappls = new MapplsGatewayLocationNameAdapter({
  endpoint: 'mock://mappls',
  fetchImpl: async () => ({ ok: true, json: async () => ({ result: { address: {
    subLocality: 'Dadar Parsi Colony', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai Suburban'
  } } }) }),
})
assert.equal(
  await mappls.resolve({ latitude: 19.025, longitude: 72.842, accuracy: 10 }),
  'Dadar Parsi Colony, Mumbai, Maharashtra',
  'a verified sub-locality may be shown with city/state context',
)
const broadOnly = new PhotonLocationNameAdapter({
  endpoint: 'mock://photon',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: {
    district: 'Mumbai Suburban', county: 'Mumbai', city: 'Mumbai', state: 'Maharashtra'
  } }] }) }),
})
assert.equal(
  await broadOnly.resolve({ latitude: 19.025, longitude: 72.842 }),
  null,
  'district/county/city-only results must not be presented as a pickup/drop area',
)

console.log('Locality resolution contract: manual refresh cannot preserve stale labels or schedule automatic retries; low-accuracy fixes remain unavailable.')
