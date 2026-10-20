import { describe, expect, it, vi } from 'vitest'
import { ValhallaRoutingAdapter } from '../valhallaRoutingAdapter.js'

// Model the native plugin's expected miss when a trace falls outside every installed tile region.
vi.mock('../offlineMapService.js', () => ({
  OfflineMapService: {
    traceRoute: async () => { throw new Error('No downloaded offline map covers this GPS trace.') }
  }
}))

describe('ValhallaRoutingAdapter road-matched geometry', () => {
  it('requests trace_route geojson and persists actual LineString geometry from the route legs', async () => {
    const calls = []
    const fetchImpl = async (url, options) => {
      calls.push({ url, options })
      return {
        ok: true,
        async json() {
          return {
            trip: {
              summary: { length: 3.42 },
              legs: [
                { shape: { type: 'LineString', coordinates: [[72.8777, 19.076], [72.8781, 19.0764]] } },
                { shape: { type: 'LineString', coordinates: [[72.8781, 19.0764], [72.8792, 19.0772]] } }
              ]
            }
          }
        }
      }
    }

    const adapter = new ValhallaRoutingAdapter({ fetchImpl, endpoint: 'https://valhalla.example.test' })
    const result = await adapter.routeTrace([
      { latitude: 19.076, longitude: 72.8777, capturedAt: '2026-09-12T04:00:00Z' },
      { latitude: 19.0772, longitude: 72.8792, capturedAt: '2026-09-12T04:00:09Z' }
    ])

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://valhalla.example.test/trace_route')
    expect(calls[0].options.headers['X-Client-Id']).toBe('KANISHKA-ENTERPRISES-PWA')

    const request = JSON.parse(calls[0].options.body)
    expect(request.shape_match).toBe('map_snap')
    expect(request.shape_format).toBe('geojson')
    expect(request.costing).toBe('auto')

    expect(result.method).toBe('VALHALLA_TRACE_ROUTE_MAP_MATCH')
    expect(result.distanceKm).toBe(3.42)
    expect(result.geometry).toEqual({
      type: 'LineString',
      coordinates: [
        [72.8777, 19.076],
        [72.8781, 19.0764],
        [72.8781, 19.0764],
        [72.8792, 19.0772]
      ]
    })
    expect(result.provenance).toMatchObject({
      provider: 'valhalla',
      operation: 'trace_route',
      shapeMatch: 'map_snap',
      shapeFormat: 'geojson'
    })
  })

  it('decodes a polyline6 leg shape when a Valhalla deployment returns encoded geometry', async () => {
    const fetchImpl = async () => ({
      ok: true,
      async json() {
        return {
          trip: {
            summary: { length: 1.1 },
            legs: [{ shape: 'e~epoA|jfpOiDaK' }]
          }
        }
      }
    })

    const adapter = new ValhallaRoutingAdapter({ fetchImpl })
    const result = await adapter.routeTrace([
      { latitude: 42.225139, longitude: -8.670911 },
      { latitude: 42.225224, longitude: -8.670718 }
    ])

    expect(result.geometry.type).toBe('LineString')
    expect(result.geometry.coordinates).toEqual([
      [-8.670911, 42.225139],
      [-8.670718, 42.225224]
    ])
  })
  
  it('does not fabricate matched geometry when Valhalla returns a distance without trace geometry', async () => {
    const adapter = new ValhallaRoutingAdapter({
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { trip: { summary: { length: 2.7 }, legs: [] } }
        }
      })
    })
    const result = await adapter.routeTrace([
      { latitude: 19.076, longitude: 72.8777 },
      { latitude: 19.0772, longitude: 72.8792 }
    ])
    expect(result.distanceKm).toBe(2.7)
    expect(result.geometry).toBeNull()
    expect(result.confidence).toBe('ESTIMATED_ROAD_TRACE_NO_GEOMETRY')
  })


  it('falls back to online Valhalla when no installed offline region covers the trace', async () => {
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

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://valhalla.example.test/trace_route')
    expect(result.method).toBe('VALHALLA_TRACE_ROUTE_MAP_MATCH')
    expect(result.distanceKm).toBe(2.4)
    expect(result.provenance.provider).toBe('valhalla')
  })
})
