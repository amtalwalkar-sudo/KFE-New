import assert from 'node:assert/strict'
import { ValhallaRoutingAdapter } from '../infrastructure/location/valhallaRoutingAdapter.js'

// On a surface without a matching installed offline region, OfflineMapService
// returns null. The routing adapter must continue to the configured online router.
const calls = []
const adapter = new ValhallaRoutingAdapter({
  endpoint: 'https://valhalla.example.test',
  fetchImpl: async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      async json() {
        return {
          trip: {
            summary: { length: 2.4 },
            legs: [{ shape: { type: 'LineString', coordinates: [[72.9, 19.1], [72.91, 19.11]] } }]
          }
        }
      }
    }
  }
})

const result = await adapter.routeTrace([
  { latitude: 19.1, longitude: 72.9, capturedAt: '2026-10-20T10:00:00Z' },
  { latitude: 19.11, longitude: 72.91, capturedAt: '2026-10-20T10:00:10Z' }
])

assert.equal(calls.length, 1, 'An offline coverage miss must proceed to exactly one online route request.')
assert.equal(calls[0].url, 'https://valhalla.example.test/trace_route')
assert.equal(result.method, 'VALHALLA_TRACE_ROUTE_MAP_MATCH')
assert.equal(result.distanceKm, 2.4)
assert.equal(result.provenance.provider, 'valhalla')
assert.ok(result.geometry?.coordinates?.length >= 2, 'Online fallback must return matched road geometry.')
console.log('PASS: no offline region match falls back to online Valhalla and returns road distance/geometry.')
