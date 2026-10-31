import assert from 'node:assert/strict'
import { LocalityResolutionService, MapplsGatewayLocationNameAdapter, PhotonLocationNameAdapter, getCachedLocationName } from '../infrastructure/location/localityResolutionAdapter.js'

const service = new LocalityResolutionService({
  primary: { endpoint: 'mock://primary', resolve: async () => null },
  fallback: { resolve: async () => null },
})
const unresolved = await service.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 10 })
assert.equal(unresolved.placeName, null)
assert.equal(unresolved.state, 'NO_LOCALITY_MATCH')
assert.equal(getCachedLocationName({ latitude: 19.076, longitude: 72.8777, accuracy: 10 }), null,
  'coordinate-keyed localStorage caching is retired; permanent labels belong to PWA IndexedDB by snapshot ID')

const lowAccuracyService = new LocalityResolutionService({
  primary: { endpoint: 'mock://primary', resolve: async () => 'Unverified area' },
  fallback: { resolve: async () => 'Unverified fallback' },
})
const missingAccuracy = await lowAccuracyService.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: null })
assert.equal(missingAccuracy.placeName, null)
assert.equal(missingAccuracy.state, 'LOW_ACCURACY')
const lowAccuracy = await lowAccuracyService.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 450 })
assert.equal(lowAccuracy.placeName, null)
assert.equal(lowAccuracy.state, 'LOW_ACCURACY')

const offlineStyleFailure = new LocalityResolutionService({
  primary: { endpoint: 'mock://primary', resolve: async () => { throw new Error('network unavailable') } },
  fallback: { resolve: async () => { throw new Error('network unavailable') } },
})
const failed = await offlineStyleFailure.resolveDetailed({ latitude: 19.076, longitude: 72.8777, accuracy: 10 })
assert.equal(failed.placeName, null)
assert.equal(failed.state, 'PROVIDER_UNAVAILABLE')

const mappls = new MapplsGatewayLocationNameAdapter({
  endpoint: 'mock://mappls',
  fetchImpl: async () => ({ ok: true, json: async () => ({ result: { lat: 19.025, lng: 72.842, address: {
    subLocality: 'Dadar Parsi Colony', city: 'Mumbai', state: 'Maharashtra', district: 'Mumbai Suburban'
  } } }) }),
})
assert.equal(await mappls.resolve({ latitude: 19.025, longitude: 72.842, accuracy: 10 }), 'Dadar Parsi Colony, Mumbai, Maharashtra')

const wrongCoordinates = new PhotonLocationNameAdapter({
  endpoint: 'mock://photon',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [72.851, 19.107] }, properties: {
    suburb: 'Dadar Parsi Colony', city: 'Mumbai', state: 'Maharashtra'
  } }] }) }),
})
assert.equal(await wrongCoordinates.resolve({ latitude: 19.025, longitude: 72.842, accuracy: 10 }), null,
  'a distant provider result must be rejected')

const photonNearby = new PhotonLocationNameAdapter({
  endpoint: 'mock://photon',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ geometry: { coordinates: [72.842, 19.025] }, properties: {
    suburb: 'Dadar Parsi Colony', city: 'Mumbai', state: 'Maharashtra'
  } }] }) }),
})
assert.equal(await photonNearby.resolve({ latitude: 19.025, longitude: 72.842, accuracy: 10 }), 'Dadar Parsi Colony, Mumbai, Maharashtra')

const broadOnly = new PhotonLocationNameAdapter({
  endpoint: 'mock://photon',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: {
    district: 'Mumbai Suburban', county: 'Mumbai', city: 'Mumbai', state: 'Maharashtra'
  } }] }) }),
})
assert.equal(await broadOnly.resolve({ latitude: 19.025, longitude: 72.842, accuracy: 10 }), null,
  'district/city-only results must not be presented as an area')

console.log('PASS: locality provider validates accuracy and proximity; coordinate-only temporary caching is retired')
