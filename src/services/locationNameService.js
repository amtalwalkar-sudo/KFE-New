const DEFAULT_REVERSE_GEOCODER = 'https://photon.komoot.io/reverse'

const endpointFromRuntime = () => {
  try { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || import.meta.env?.VITE_REVERSE_GEOCODER_ENDPOINT || DEFAULT_REVERSE_GEOCODER } catch { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || DEFAULT_REVERSE_GEOCODER }
}

// Display area/locality names only. Photon may return a POI or street in
// properties.name/street; those are intentionally not used as the visible label.
const formatFeature = feature => {
  const p = feature?.properties || {}
  const locality = p.suburb || p.neighbourhood || p.neighborhood || p.locality || p.district || p.county || p.city_district || null
  const city = p.city || p.town || p.village || p.municipality || null
  const state = p.state || null
  const parts = []
  const add = value => {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text && !parts.some(existing => existing.toLocaleLowerCase() === text.toLocaleLowerCase())) parts.push(text)
  }
  add(locality)
  add(city)
  add(state)
  return parts.join(', ') || null
}

export class PhotonLocationNameAdapter {
  constructor({ endpoint = endpointFromRuntime(), fetchImpl = globalThis.fetch } = {}) { this.endpoint = String(endpoint).replace(/\/$/, ''); this.fetchImpl = fetchImpl }
  async resolve(location) {
    if (!location || typeof this.fetchImpl !== 'function') return null
    const lat = Number(location.latitude); const lon = Number(location.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    const response = await this.fetchImpl(`${this.endpoint}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`)
    if (!response.ok) return null
    const payload = await response.json()
    return formatFeature(payload?.features?.[0])
  }
}

export const resolveLocationName = async (location, resolver) => {
  try { return resolver?.resolve ? await resolver.resolve(location) : null } catch (error) { console.warn('Location name resolution unavailable; coordinates remain authoritative.', error); return null }
}
