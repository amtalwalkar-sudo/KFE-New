import assert from 'node:assert/strict'
import { PhotonLocationNameAdapter, resolveLocationName } from '../services/locationNameService.js'

const adapter = new PhotonLocationNameAdapter({
  endpoint: 'https://example.invalid/reverse',
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      features: [{
        properties: {
          name: 'Andheri East',
          suburb: 'Andheri East',
          street: 'Mahakali Caves Road',
          city: 'Mumbai',
          state: 'Maharashtra'
        }
      }]
    })
  })
})
assert.equal(
  await adapter.resolve({ latitude: 19.12, longitude: 72.86 }),
  'Andheri East, Mumbai, Maharashtra',
  'visible labels should use locality and city, never street names'
)

const cityOnly = new PhotonLocationNameAdapter({
  endpoint: 'https://example.invalid/reverse',
  fetchImpl: async () => ({ ok: true, json: async () => ({ features: [{ properties: { street: 'Link Road', city: 'Mumbai', state: 'Maharashtra' } }] }) })
})
assert.equal(await cityOnly.resolve({ latitude: 19.0, longitude: 72.8 }), 'Mumbai, Maharashtra',
  'when no locality is available, use city/state rather than a street')

const unavailable = new PhotonLocationNameAdapter({
  endpoint: 'https://example.invalid/reverse',
  fetchImpl: async () => { throw new Error('offline') }
})
assert.equal(await resolveLocationName({ latitude: 19, longitude: 72 }, unavailable), null,
  'reverse-geocoding failure must remain non-fatal and must not fabricate a label')
assert.equal(await adapter.resolve({ latitude: 'bad', longitude: 72 }), null,
  'invalid coordinates must not be geocoded')

console.log('PASS: reverse geocoding returns area-level labels and fails non-fatally')
