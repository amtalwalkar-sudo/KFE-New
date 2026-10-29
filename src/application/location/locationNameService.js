const PHOTON = 'https://photon.komoot.io/reverse'
const gateway = () => { try { return globalThis.__KFE_MAPPLS_GEOCODER_GATEWAY__ || import.meta.env?.VITE_MAPPLS_GEOCODER_GATEWAY_ENDPOINT || '' } catch { return globalThis.__KFE_MAPPLS_GEOCODER_GATEWAY__ || '' } }
const photonEndpoint = () => { try { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || import.meta.env?.VITE_REVERSE_GEOCODER_ENDPOINT || PHOTON } catch { return globalThis.__KFE_REVERSE_GEOCODER_ENDPOINT__ || PHOTON } }
const CACHE_KEY = 'kfe:locality-cache:v2'
const keyFor = l => { const lat=Number(l?.latitude), lon=Number(l?.longitude); return Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180 ? lat.toFixed(5)+':'+lon.toFixed(5) : null }
const propertiesOf = p => p?.features?.[0]?.properties || p?.result?.address || p?.address || p?.result || p
// Display area/locality names only. Never use a POI name or street as the visible label.
const formatProperties = p => {
  if (!p || typeof p !== 'object') return null
  const parts=[]
  for (const v of [p.suburb || p.neighbourhood || p.neighborhood || p.locality || p.district || p.county || p.city_district || p.area || p.subDistrict,p.city || p.town || p.village || p.municipality || p.cityName,p.state || p.stateName]) {
    const s=typeof v==='string'?v.trim():''
    if(s&&!parts.some(x=>x.toLowerCase()===s.toLowerCase())) parts.push(s)
  }
  return parts.join(', ')||null
}
const fetchLabel = async (endpoint,l,fetchImpl) => {
  if(!keyFor(l)||!endpoint||typeof fetchImpl!=='function') return null
  const sep=endpoint.includes('?')?'&':'?'
  const response=await fetchImpl(endpoint.replace(/\/$/,'')+sep+'lat='+encodeURIComponent(Number(l.latitude))+'&lon='+encodeURIComponent(Number(l.longitude)),{headers:{Accept:'application/json'}})
  if(!response.ok){const e=new Error('Reverse geocoder HTTP '+response.status);e.status=response.status;throw e}
  return formatProperties(propertiesOf(await response.json()))
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
  async resolveDetailed(l){
    const key=keyFor(l);if(!key)return {placeName:null,state:'INVALID_COORDINATES',provider:null,cacheHit:false}
    let cache={};try{cache=JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY)||'{}')||{}}catch{}
    if(this.cacheEnabled&&cache[key]?.placeName)return {placeName:cache[key].placeName,state:'RESOLVED',provider:cache[key].provider||'cache',cacheHit:true}
    let lastError=null
    for(const [name,provider] of [['mappls-gateway',this.primary],['photon',this.fallback]]){
      if(!provider||(name==='mappls-gateway'&&!provider.endpoint))continue
      try{
        const placeName=await provider.resolve(l);if(!placeName)continue
        if(this.cacheEnabled){cache[key]={placeName,provider:name,resolvedAt:new Date().toISOString()};const ordered=Object.entries(cache).sort((a,b)=>String(b[1]?.resolvedAt||'').localeCompare(String(a[1]?.resolvedAt||''))).slice(0,500);try{globalThis.localStorage?.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(ordered)))}catch{}}
        return {placeName,state:'RESOLVED',provider:name,cacheHit:false}
      }catch(e){lastError=e}
    }
    return {placeName:null,state:'RETRY_SCHEDULED',provider:null,cacheHit:false,error:lastError?.status===429?'RATE_LIMITED':lastError?'PROVIDER_UNAVAILABLE':'NO_LOCALITY_MATCH'}
  }
  async resolve(l){return (await this.resolveDetailed(l)).placeName}
}
const defaultResolver=new LocalityResolutionService()
export const resolveLocationNameDetailed=async(l,resolver=defaultResolver)=>{
  try{if(resolver?.resolveDetailed)return await resolver.resolveDetailed(l);const placeName=resolver?.resolve?await resolver.resolve(l):null;return {placeName:placeName||null,state:placeName?'RESOLVED':'RETRY_SCHEDULED',provider:null,cacheHit:false}}
  catch(e){console.warn('Location name resolution unavailable; coordinates remain authoritative.',e);return {placeName:null,state:'RETRY_SCHEDULED',provider:null,cacheHit:false,error:'PROVIDER_UNAVAILABLE'}}
}
export const resolveLocationName=async(l,resolver=defaultResolver)=>(await resolveLocationNameDetailed(l,resolver)).placeName
export const localityResolutionCacheKey=keyFor
