const DEFAULT_VALHALLA_ENDPOINT = 'https://valhalla1.openstreetmap.de'
const KFE_CLIENT_ID = 'KANISHKA-ENTERPRISES-PWA'
const DEFAULT_TIMEOUT_MS = 8000
const OFFLINE_MATCH_BUDGET_MS = 1200
const tryOfflineTrace = async points => {
  try {
    const { OfflineMapService } = await import('./offlineMapService.js')
    const pending = OfflineMapService.traceRoute(points)
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), OFFLINE_MATCH_BUDGET_MS))
    const result = await Promise.race([pending, timeout])
    const payload = result?.raw
    if (!payload?.trip) return null
    const distance = Number(payload.trip?.summary?.length)
    const geometry = geometryFromTrip(payload.trip)
    return {
      provider: 'valhalla-mobile',
      method: 'OFFLINE_VALHALLA_TRACE_ROUTE_MAP_MATCH',
      confidence: geometry ? 'ESTIMATED_ROAD_TRACE' : 'ESTIMATED_ROAD_TRACE_NO_GEOMETRY',
      distanceKm: Number.isFinite(distance) ? distance : null,
      geometry,
      provenance: { provider: 'valhalla-mobile', regionId: result.regionId || 'mumbai-pune-nashik-alibag-v1', operation: 'trace_route', shapeMatch: 'map_snap', costing: 'auto', units: 'kilometers', sourcePointCount: toShape(points).length },
      raw: payload
    }
  } catch (error) {
    // Matching is enrichment only: callers must retain raw GPS evidence and continue.
    console.warn('Offline Valhalla matching unavailable; continuing with online/queued matching.', error)
    return null
  }
}

const toShape = (points) => {
  const validPoints = points.map((point) => {
    const capturedAt = point.capturedAt || point.timestamp
    const milliseconds = capturedAt ? new Date(capturedAt).getTime() : NaN
    return { lat: Number(point.latitude), lon: Number(point.longitude), ...(Number.isFinite(milliseconds) ? { time: Math.floor(milliseconds / 1000) } : {}) }
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  // Valhalla trace_route requires explicit shape-point types: break at the
  // start/end and via for intermediate fixes. Omitting type can return HTTP
  // 400 / error 442 ("No path could be found") even for valid road traces.
  return validPoints.map((point, index) => ({
    ...point,
    type: index === 0 || index === validPoints.length - 1 ? 'break' : 'via'
  }))
}

const endpointFromRuntime = () => {
  try {
    return globalThis.__KFE_VALHALLA_ENDPOINT__ || import.meta.env?.VITE_VALHALLA_ENDPOINT || DEFAULT_VALHALLA_ENDPOINT
  } catch {
    return globalThis.__KFE_VALHALLA_ENDPOINT__ || DEFAULT_VALHALLA_ENDPOINT
  }
}

const decodePolyline6 = (encoded) => {
  if (typeof encoded !== 'string' || !encoded) return []
  const coordinates = []
  let index = 0
  let latitude = 0
  let longitude = 0
  const factor = 1e6

  const nextValue = () => {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      if (index >= encoded.length) return null
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return (result & 1) ? ~(result >> 1) : (result >> 1)
  }

  while (index < encoded.length) {
    const latDelta = nextValue()
    const lonDelta = nextValue()
    if (latDelta === null || lonDelta === null) return []
    latitude += latDelta
    longitude += lonDelta
    coordinates.push([longitude / factor, latitude / factor])
  }
  return coordinates
}

const geometryFromTrip = (trip = {}) => {
  const legs = Array.isArray(trip.legs) ? trip.legs : []
  const coordinates = []
  for (const leg of legs) {
    const shape = leg?.shape
    if (shape?.type === 'LineString' && Array.isArray(shape.coordinates)) {
      coordinates.push(...shape.coordinates)
      continue
    }
    if (shape?.type === 'Feature' && shape.geometry?.type === 'LineString' && Array.isArray(shape.geometry.coordinates)) {
      coordinates.push(...shape.geometry.coordinates)
      continue
    }
    if (typeof shape === 'string') coordinates.push(...decodePolyline6(shape))
  }
  if (coordinates.length < 2) return null
  return { type: 'LineString', coordinates }
}

export class ValhallaRoutingAdapter {
  constructor({ endpoint = endpointFromRuntime(), fetchImpl = globalThis.fetch, clientId = KFE_CLIENT_ID, timeoutMs = DEFAULT_TIMEOUT_MS, onlineFallback = true } = {}) {
    this.endpoint = String(endpoint || DEFAULT_VALHALLA_ENDPOINT).replace(/\/$/, '')
    this.fetchImpl = fetchImpl
    this.clientId = clientId
    this.timeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
    this.onlineFallback = onlineFallback !== false
  }

  async routeTrace(points) {
    const offline = await tryOfflineTrace(points)
    if (offline) return offline
    // Offline capture/reconciliation must never wait for an unreachable endpoint.
    if (!this.onlineFallback || typeof this.fetchImpl !== 'function') return null
    const shape = toShape(points)
    if (shape.length < 2) return null
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null
    try {
      const response = await this.fetchImpl(`${this.endpoint}/trace_route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Client-Id': this.clientId },
        body: JSON.stringify({ shape, shape_match: 'map_snap', costing: 'auto', units: 'kilometers', shape_format: 'geojson' }),
        ...(controller ? { signal: controller.signal } : {})
      })
      if (!response.ok) throw new Error(`Valhalla trace request failed: ${response.status}`)
      const payload = await response.json()
      const distance = Number(payload.trip?.summary?.length)
      const geometry = geometryFromTrip(payload.trip)
      return {
        provider: 'valhalla',
        method: 'VALHALLA_TRACE_ROUTE_MAP_MATCH',
        confidence: geometry ? 'ESTIMATED_ROAD_TRACE' : 'ESTIMATED_ROAD_TRACE_NO_GEOMETRY',
        distanceKm: Number.isFinite(distance) ? distance : null,
        geometry,
        provenance: { provider: 'valhalla', endpoint: this.endpoint, operation: 'trace_route', shapeMatch: 'map_snap', costing: 'auto', units: 'kilometers', shapeFormat: 'geojson', sourcePointCount: shape.length },
        raw: payload
      }
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}

export const getValhallaEndpoint = () => endpointFromRuntime()
