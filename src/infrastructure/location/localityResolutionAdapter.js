const PHOTON = 'https://photon.komoot.io/reverse'
const gateway = () => { try { return globalThis.__KFE_MAPPLS_GEOCODER_GATEWAY__ || import.meta.env?.VITE_MAPPLS_GEOCODER_GATEWAY_ENDPOINT || '' } catch { return globalThis.__KFE_MAPPLS_GEOCODER_GATEWAY__ || '' } }
const photonEndpoint = () => { try { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || import.meta.env?.VITE_REVERSE_GEOCODER_ENDPOINT || PHOTON } catch { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || PHOTON } }
const MAX_LOCALITY_ACCURACY_METERS = 150
const hasReliableAccuracy = location => {
  const accuracy = Number(location?.accuracy)
  return Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= MAX_LOCALITY_ACCURACY_METERS
}
const keyFor = l => { const lat=Number(l?.latitude), lon=Number(l?.longitude); return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180 ? lat.toFixed(5)+':'+lon.toFixed(5) : null }
const formatProperties = p => {
  if (!p || typeof p !== 'object') return null
  // Display only locality/sub-locality fields, never a POI, street or broad district.
  const area = [p.subLocality, p.sub_locality, p.suburb, p.neighbourhood, p.neighborhood, p.locality, p.city_district, p.area, p.village, p.town]
    .find(value => typeof value === 'string' && value.trim())
  if (!area) return null
  const parts = [area.trim()]
  for (const v of [p.city || p.municipality || p.cityName, p.state || p.stateName]) {
    const s = typeof v === 'string' ? v.trim() : ''
    if (s && !parts.some(x => x.toLowerCase() === s.toLowerCase())) parts.push(s)
  }
  return parts.join(', ')
}
const coordinatesOf = value => {
  if (!value || typeof value !== 'object') return null
  const pair = Array.isArray(value.coordinates) ? value.coordinates
    : Array.isArray(value.geometry?.coordinates) ? value.geometry.coordinates : null
  if (pair?.length >= 2) {
    const longitude = Number(pair[0]), latitude = Number(pair[1])
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
  }
  const latitude = Number(value.latitude ?? value.lat)
  const longitude = Number(value.longitude ?? value.lon ?? value.lng)
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null
}
const distanceMeters = (a, b) => {
  const radians = degrees => degrees * Math.PI / 180
  const dLat = radians(b.latitude - a.latitude)
  const dLon = radians(b.longitude - a.longitude)
  const lat1 = radians(a.latitude), lat2 = radians(b.latitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}
const candidatesOf = payload => {
  if (Array.isArray(payload?.features)) return payload.features.map(feature => ({
    properties: feature?.properties,
    coordinates: coordinatesOf(feature?.geometry) || coordinatesOf(feature?.properties),
  }))
  const results = Array.isArray(payload?.results) ? payload.results
    : payload?.result ? [payload.result] : [payload]
  return results.map(result => ({
    properties: result?.address || result?.properties || result,
    coordinates: coordinatesOf(result) || coordinatesOf(result?.geometry) || coordinatesOf(result?.location),
  }))
}
const fetchLabel = async (endpoint,l,fetchImpl) => {
  if(!keyFor(l)||!endpoint||typeof fetchImpl!=='function') return null
  const sep=endpoint.includes('?')?'&':'?'
  const response=await fetchImpl(endpoint.replace(/\/$/,'')+sep+'lat='+encodeURIComponent(Number(l.latitude))+'&lon='+encodeURIComponent(Number(l.longitude)),{headers:{Accept:'application/json'}})
  if(!response.ok){const e=new Error('Reverse geocoder HTTP '+response.status);e.status=response.status;throw e}
  const payload = await response.json()
  const source = { latitude: Number(l.latitude), longitude: Number(l.longitude) }
  const accuracy = Number(l.accuracy)
  // Require provider-returned coordinates and verify they are near the event-time GPS fix.
  // Without that evidence a plausible but unrelated locality must never be cached or shown.
  const tolerance = Math.min(300, Math.max(100, accuracy * 2))
  const matching = candidatesOf(payload)
    .filter(candidate => candidate.coordinates
      && Number.isFinite(candidate.coordinates.latitude) && Math.abs(candidate.coordinates.latitude) <= 90
      && Number.isFinite(candidate.coordinates.longitude) && Math.abs(candidate.coordinates.longitude) <= 180
      && distanceMeters(source, candidate.coordinates) <= tolerance)
    .map(candidate => ({ placeName: formatProperties(candidate.properties), distance: distanceMeters(source, candidate.coordinates) }))
    .filter(candidate => candidate.placeName)
    .sort((a,b) => a.distance - b.distance)
  return matching[0]?.placeName || null
}
export class MapplsGatewayLocationNameAdapter {
  constructor({endpoint=gateway(),fetchImpl=globalThis.fetch}={}){this.endpoint=String(endpoint||'').replace(/\/$/,'');this.fetchImpl=fetchImpl}
  resolve(l){return fetchLabel(this.endpoint,l,this.fetchImpl)}
}
export class PhotonLocationNameAdapter {
  constructor({endpoint=photonEndpoint(),fetchImpl=globalThis.fetch}={}){this.endpoint=String(endpoint).replace(/\/$/,'');this.fetchImpl=fetchImpl}
  resolve(l){return fetchLabel(this.endpoint,l,this.fetchImpl)}
}
/** Shared locality contract. Mappls credentials stay server-side; Photon is fallback. */
export class LocalityResolutionService {
  constructor({primary=new MapplsGatewayLocationNameAdapter(),fallback=new PhotonLocationNameAdapter(),cacheEnabled=true}={}){this.primary=primary;this.fallback=fallback;this.cacheEnabled=cacheEnabled}
  async resolveDetailed(l,{forceRefresh=false}={}){
    const key=keyFor(l);if(!key)return {placeName:null,state:'INVALID_COORDINATES',provider:null,cacheHit:false}
    if(!hasReliableAccuracy(l))return {placeName:null,state:'LOW_ACCURACY',provider:null,cacheHit:false}
      let lastError=null
    for(const [name,provider] of [['mappls-gateway',this.primary],['photon',this.fallback]]){
      if(!provider||(name==='mappls-gateway'&&!provider.endpoint))continue
      try{
        const placeName=await provider.resolve(l);if(!placeName)continue
        return {placeName,state:'RESOLVED',provider:name,cacheHit:false}
      }catch(e){lastError=e}
    }
    return {placeName:null,state:lastError?.status===429?'RATE_LIMITED':lastError?'PROVIDER_UNAVAILABLE':'NO_LOCALITY_MATCH',provider:null,cacheHit:false,error:lastError?.status===429?'RATE_LIMITED':lastError?'PROVIDER_UNAVAILABLE':'NO_LOCALITY_MATCH'}
  }
  async resolve(l){return (await this.resolveDetailed(l)).placeName}
}
const defaultResolver=new LocalityResolutionService()
export const resolveLocationNameDetailed=async(l,resolver=defaultResolver,options={})=>{
  try{if(resolver?.resolveDetailed)return await resolver.resolveDetailed(l,options);const placeName=resolver?.resolve?await resolver.resolve(l):null;return {placeName:placeName||null,state:placeName?'RESOLVED':'NO_LOCALITY_MATCH',provider:null,cacheHit:false}}
  catch(e){console.warn('Location name resolution unavailable; coordinates remain authoritative.',e);return {placeName:null,state:'PROVIDER_UNAVAILABLE',provider:null,cacheHit:false,error:'PROVIDER_UNAVAILABLE'}}
}
export const resolveLocationName=async(l,resolver=defaultResolver)=>(await resolveLocationNameDetailed(l,resolver)).placeName
export const localityResolutionCacheKey=keyFor
export const getCachedLocationName = () => null // Locality persistence belongs to the PWA IndexedDB repository, keyed by snapshot ID.
export const LocalityResolutionAdapter = Object.freeze({
  resolveLocationNameDetailed,
  resolveLocationName,
  localityResolutionCacheKey,
  getCachedLocationName,
})
