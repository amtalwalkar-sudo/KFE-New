import { describe, expect, it } from 'vitest'
import { ValhallaRoutingAdapter } from '../valhallaRoutingAdapter.js'

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
})
