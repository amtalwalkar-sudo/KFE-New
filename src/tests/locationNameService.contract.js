import assert from 'node:assert/strict'
import { PhotonLocationNameAdapter, MapplsGatewayLocationNameAdapter, LocalityResolutionService, resolveLocationName, resolveLocationNameDetailed } from '../services/locationNameService.js'

const photon = new PhotonLocationNameAdapter({
  endpoint: 'https://example.invalid/reverse',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: {
    name: 'Andheri East', suburb: 'Andheri East', street: 'Mahakali Caves Road', city: 'Mumbai', state: 'Maharashtra'
  } }] }) })
})
assert.equal(await photon.resolve({ latitude: 19.12, longitude: 72.86 }), 'Andheri East, Mumbai, Maharashtra',
  'locality labels use locality/city/state, never a street name')
const cityOnly = new PhotonLocationNameAdapter({
  endpoint: 'https://example.invalid/reverse',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: { street: 'Link Road', city: 'Mumbai', state: 'Maharashtra' } }] }) })
})
assert.equal(await cityOnly.resolve({ latitude: 19, longitude: 72 }), 'Mumbai, Maharashtra')
const gateway = new MapplsGatewayLocationNameAdapter({
  endpoint: 'https://gateway.example.invalid/reverse',
  fetchImpl: async () => ({ ok: true, json: async () => ({ locality: 'Andheri East', city: 'Mumbai', state: 'Maharashtra' }) })
})
assert.equal(await gateway.resolve({ latitude: 19.12, longitude: 72.86 }), 'Andheri East, Mumbai, Maharashtra',
  'secure provider gateway responses normalize into the common locality contract')
let fallbackCalls = 0
const resolver = new LocalityResolutionService({
  primary: { endpoint: 'https://gateway.example.invalid/reverse', resolve: async () => { throw new Error('gateway unavailable') } },
  fallback: { resolve: async () => { fallbackCalls++; return 'Andheri East, Mumbai, Maharashtra' } }, cacheEnabled: false
})
const fallbackResult = await resolver.resolveDetailed({ latitude: 19.12, longitude: 72.86 })
assert.equal(fallbackResult.placeName, 'Andheri East, Mumbai, Maharashtra')
assert.equal(fallbackResult.provider, 'photon')
assert.equal(fallbackCalls, 1, 'primary failure must invoke fallback')
const unavailable = new PhotonLocationNameAdapter({ fetchImpl: async () => { throw new Error('offline') } })
assert.equal(await resolveLocationName({ latitude: 19, longitude: 72 }, unavailable), null,
  'lookup failure is non-fatal and never fabricates a locality')
assert.equal((await resolveLocationNameDetailed({ latitude: 'bad', longitude: 72 })).state, 'INVALID_COORDINATES')
assert.equal(await photon.resolve({ latitude: 'bad', longitude: 72 }), null)
console.log('PASS: shared locality contract normalizes providers, falls back safely and rejects invalid coordinates')
