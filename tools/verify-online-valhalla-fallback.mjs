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

const liveFetch = async (...args) => {
  const response = await fetch(...args)
  if (!response.ok) {
    const diagnostic = await response.clone().text().catch(() => '')
    console.error('Live Valhalla response diagnostic:', JSON.stringify({
      status: response.status,
      endpoint: args[0],
      body: diagnostic.slice(0, 2000)
    }))
  }
  return response
}
const adapter = new ValhallaRoutingAdapter({ timeoutMs: 25000, fetchImpl: liveFetch })
// Use a short northbound trace near Mumbai's Western Express Highway and omit
// timestamps: this probe validates road matching, not GPS cadence or speed.
const result = await adapter.routeTrace([
  { latitude: 19.1190, longitude: 72.8690 },
  { latitude: 19.1230, longitude: 72.8690 },
  { latitude: 19.1270, longitude: 72.8690 }
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
