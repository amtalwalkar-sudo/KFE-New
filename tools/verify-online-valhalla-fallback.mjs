import assert from 'node:assert/strict'
import { OfflineMapService } from '../src/infrastructure/location/offlineMapService.js'
import { ValhallaRoutingAdapter } from '../src/infrastructure/location/valhallaRoutingAdapter.js'

// Force the exact "no installed offline region covers this trace" condition,
// while keeping the online request real (no mocked fetch or canned response).
OfflineMapService.traceRoute = async () => {
  throw new Error('No downloaded offline map covers this GPS trace.')
}
globalThis.__KFE_VALHALLA_ENDPOINT__ =
  process.env.KFE_VALHALLA_ENDPOINT || 'https://valhalla1.openstreetmap.de'

const adapter = new ValhallaRoutingAdapter({ timeoutMs: 25000 })
const result = await adapter.routeTrace([
  { latitude: 40.7484, longitude: -73.9857, capturedAt: '2026-10-20T10:00:00Z' },
  { latitude: 40.7527, longitude: -73.9772, capturedAt: '2026-10-20T10:00:20Z' },
  { latitude: 40.7580, longitude: -73.9855, capturedAt: '2026-10-20T10:00:40Z' }
])

assert.ok(result, 'Online Valhalla must return a route after the offline coverage miss.')
assert.equal(result.provenance.provider, 'valhalla')
assert.equal(result.method, 'VALHALLA_TRACE_ROUTE_MAP_MATCH')
assert.ok(Number.isFinite(result.distanceKm) && result.distanceKm > 0,
  'Live online fallback must return a positive road-matched distance.')
assert.ok(result.geometry?.type === 'LineString' && result.geometry.coordinates.length >= 2,
  'Live online fallback must return matched road geometry.')
console.log(JSON.stringify({
  status: 'PASS',
  scenario: 'offline coverage miss followed by live online Valhalla fallback',
  endpoint: globalThis.__KFE_VALHALLA_ENDPOINT__,
  distanceKm: result.distanceKm,
  geometryPointCount: result.geometry.coordinates.length,
  provider: result.provenance.provider,
  method: result.method
}, null, 2))
