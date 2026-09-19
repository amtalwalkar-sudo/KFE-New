const EARTH_RADIUS_KM = 6371.0088
const EPSILON_KM = 1e-6
const MAX_ACCURACY_METERS = 80
const JITTER_DISTANCE_KM = 0.03
const STATIONARY_SPEED_KMH = 2
const finite = value => Number.isFinite(Number(value))

const normalizeLocation = location => {
  if (!location) return null
  const latitude = Number(location.latitude); const longitude = Number(location.longitude)
  const accuracy = location.accuracy == null ? null : Number(location.accuracy)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null, speed: finite(location.speed) ? Number(location.speed) : null, bearing: finite(location.bearing) ? Number(location.bearing) : null, capturedAt: location.capturedAt || location.timestamp || null }
}

export const haversineDistanceKm = (from, to) => {
  const a = normalizeLocation(from); const b = normalizeLocation(to)
  if (!a || !b) return null
  const lat1 = a.latitude * Math.PI / 180; const lat2 = b.latitude * Math.PI / 180
  const dLat = lat2 - lat1; const dLon = (b.longitude - a.longitude) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}
const orderedTrace = (snapshots = []) => [...snapshots].filter(Boolean).map(normalizeLocation).filter(Boolean).sort((a, b) => new Date(a.capturedAt || 0) - new Date(b.capturedAt || 0))
export const filterGpsTrace = points => {
  const filtered = []
  for (const point of orderedTrace(points)) {
    if (point.accuracy != null && point.accuracy > MAX_ACCURACY_METERS) continue
    const previous = filtered[filtered.length - 1]
    if (!previous) { filtered.push(point); continue }
    const displacement = haversineDistanceKm(previous, point) || 0; const speed = Number(point.speed)
    if (Number.isFinite(speed) && speed <= STATIONARY_SPEED_KMH && displacement <= JITTER_DISTANCE_KM) continue
    filtered.push(point)
  }
  return filtered
}
const waitingAnchorForTrace = points => {
  const trace = filterGpsTrace(points); if (!trace.length) return null
  let anchor = trace[0]
  for (let i = 1; i < trace.length; i += 1) { const point = trace[i]; const speed = Number(point.speed); if (Number.isFinite(speed) && speed > STATIONARY_SPEED_KMH) break; anchor = point }
  return anchor
}
const sum = (segments, classification) => segments.filter(s => s.classification === classification && finite(s.distanceKm)).reduce((t, s) => t + Number(s.distanceKm), 0)
const normalizeManualKm = (trip, manualBusinessKmByTripId = {}) => { const value = manualBusinessKmByTripId[trip.id]; if (value === undefined || value === null || value === '') return null; const km = Number(value); if (!Number.isFinite(km) || km < 0) throw new Error(`Invalid Uber Business KM for trip ${trip.id}.`); return km }
const pointsBetween = (snapshots, startAt, endAt, from, to) => { const points = []; const a = normalizeLocation(from); const b = normalizeLocation(to); if (a) points.push({ ...a, capturedAt: startAt || new Date(0).toISOString() }); for (const snapshot of orderedTrace(snapshots)) { const t = new Date(snapshot.capturedAt || 0).getTime(); if ((!startAt || t >= new Date(startAt).getTime()) && (!endAt || t <= new Date(endAt).getTime())) points.push(snapshot) } if (b) points.push({ ...b, capturedAt: endAt || new Date().toISOString() }); return filterGpsTrace(points) }
export const routeTrace = async (trace, router) => {
  const points = filterGpsTrace(trace)
  if (points.length < 2) return { distanceKm: null, method: 'UNAVAILABLE', confidence: 'UNAVAILABLE', roadMatchedGeometry: null, traceGeometry: [], provenance: null, points }
  try {
    const routed = typeof router?.routeTrace === 'function' ? await router.routeTrace(points) : typeof router === 'function' ? await router(points[0], points[points.length - 1], points) : null
    if (routed && finite(routed.distanceKm) && Number(routed.distanceKm) >= 0) return { distanceKm: Number(routed.distanceKm), method: routed.method || 'ROUTED_TRACE', confidence: routed.confidence || 'ESTIMATED_ROAD_TRACE', roadMatchedGeometry: routed.provenance?.provider === 'valhalla' || String(routed.method || '').includes('MAP_MATCH') ? (routed.geometry || null) : null, traceGeometry: Array.isArray(routed.geometry) ? routed.geometry : [], provenance: routed.provenance || { provider: routed.provider || 'UNKNOWN', method: routed.method || 'ROUTED_TRACE' }, points }
  } catch (error) { console.warn('Routing engine unavailable; falling back to filtered GPS trace.', error) }
  let distanceKm = 0
  for (let i = 1; i < points.length; i += 1) distanceKm += haversineDistanceKm(points[i - 1], points[i]) || 0
  return { distanceKm, method: 'FILTERED_GPS_TRACE', confidence: 'ESTIMATED_TRACE', roadMatchedGeometry: null, traceGeometry: points.map(p => [p.longitude, p.latitude]), provenance: { provider: 'KFE_TRACE_FALLBACK', method: 'FILTERED_GPS_TRACE' }, points }
}
const makeSegment = async ({ from, to, classification, label, router, tripId = null, trace = [] }) => {
  const filteredTrace = filterGpsTrace(trace); const routeResult = await routeTrace(filteredTrace, router)
  const fallbackFrom = normalizeLocation(from); const fallbackTo = normalizeLocation(to); let result = routeResult
  if (result.distanceKm === null && fallbackFrom && fallbackTo) result = { distanceKm: haversineDistanceKm(fallbackFrom, fallbackTo), method: 'HAVERSINE_ENDPOINT_FALLBACK', confidence: 'ESTIMATED_STRAIGHT_LINE', roadMatchedGeometry: null, traceGeometry: [fallbackFrom, fallbackTo], provenance: { provider: 'KFE_ENDPOINT_FALLBACK', method: 'HAVERSINE_ENDPOINT_FALLBACK' }, points: filteredTrace }
  return { id: `${label}:${tripId || 'SHIFT'}`, tripId, label, classification, authority: 'GPS_ESTIMATE', from: fallbackFrom, to: fallbackTo, distanceKm: result.distanceKm, method: result.method, confidence: result.confidence, gpsTracePoints: result.points.length, filteredGpsTrace: result.points, roadMatchedGeometry: result.roadMatchedGeometry, traceGeometry: result.traceGeometry, routingProvenance: result.provenance, waitingAnchor: waitingAnchorForTrace(filteredTrace) }
}

export const MovementAccountingService = {
  filterGpsTrace,
  waitingAnchorForTrace,
  async calculateSegments({ garageLocation, trips = [], router, gpsSnapshots = [] } = {}) {
    const garage = normalizeLocation(garageLocation)
    const completed = [...trips].filter(t => t?.status === 'COMPLETED' && t?.tripStartAt && t?.tripEndAt).sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt))
    const snapshots = orderedTrace(gpsSnapshots); const segments = []
    if (!completed.length) return { segments, deadMilesKm: 0, businessMilesKm: 0, unclassifiedKm: 0, gpsTracePoints: snapshots.length, routingProvenance: [], roadMatchedGeometry: [] }
    const first = completed[0]
    if (garage) segments.push(await makeSegment({ from: garage, to: first.tripStartLocation, classification: 'DEAD', label: 'GARAGE_TO_FIRST_PICKUP', router, trace: pointsBetween(snapshots, null, first.tripStartAt, garage, first.tripStartLocation) }))
    for (let i = 0; i < completed.length; i += 1) {
      const trip = completed[i]; const next = completed[i + 1]
      segments.push(await makeSegment({ from: trip.tripStartLocation, to: trip.tripEndLocation, classification: 'BUSINESS', label: `TRIP_${i + 1}_BUSINESS`, router, tripId: trip.id, trace: pointsBetween(snapshots, trip.tripStartAt, trip.tripEndAt, trip.tripStartLocation, trip.tripEndLocation) }))
      const deadTo = next ? next.tripStartLocation : garage
      if (deadTo) segments.push(await makeSegment({ from: trip.tripEndLocation, to: deadTo, classification: 'DEAD', label: next ? `TRIP_${i + 1}_END_TO_TRIP_${i + 2}_START` : 'LAST_TRIP_TO_GARAGE', router, trace: pointsBetween(snapshots, trip.tripEndAt, next?.tripStartAt || null, trip.tripEndLocation, deadTo) }))
    }
    return { segments, deadMilesKm: sum(segments, 'DEAD'), businessMilesKm: sum(segments, 'BUSINESS'), unclassifiedKm: sum(segments, 'UNCLASSIFIED'), gpsTracePoints: snapshots.length, routingProvenance: segments.map(s => ({ segmentId: s.id, ...s.routingProvenance })), roadMatchedGeometry: segments.filter(s => s.roadMatchedGeometry).map(s => ({ segmentId: s.id, geometry: s.roadMatchedGeometry })), traceGeometry: segments.map(s => ({ segmentId: s.id, geometry: s.traceGeometry })) }
  },
  async reconcileShiftMovement({ garageLocation, trips = [], startOdometer, endOdometer, router, manualBusinessKmByTripId = {}, businessKmByTripId = {}, gpsSnapshots = [] } = {}) {
    const start = Number(startOdometer); const end = Number(endOdometer)
    if (!finite(start) || !finite(end) || start < 0 || end < start) throw new Error('Valid Shift Start and End Odometer readings are required for movement reconciliation.')
    const base = await this.calculateSegments({ garageLocation, trips, router, gpsSnapshots }); const totalShiftVehicleKm = end - start; const manualByTrip = new Map(); const reconciledSegments = base.segments.map(s => ({ ...s }))
    for (const trip of trips.filter(item => item?.status === 'COMPLETED')) { const manualKm = normalizeManualKm(trip, manualBusinessKmByTripId); if (manualKm === null) continue; const segment = reconciledSegments.find(item => item.tripId === trip.id && item.classification === 'BUSINESS'); if (!segment) throw new Error(`Business segment not found for trip ${trip.id}.`); segment.distanceKm = manualKm; segment.method = 'UBER_MANUAL'; segment.confidence = 'AUTHORITATIVE'; segment.authority = 'MANUAL_UBER'; manualByTrip.set(trip.id, manualKm) }
    for (const trip of trips.filter(item => item?.status === 'COMPLETED')) {
      const businessKm = Number(businessKmByTripId[trip.id])
      if (!Number.isFinite(businessKm) || businessKm < 0 || manualByTrip.has(trip.id)) continue
      const segment = reconciledSegments.find(item => item.tripId === trip.id && item.classification === 'BUSINESS')
      if (!segment) continue
      segment.distanceKm = businessKm
      segment.method = trip.tripKmAuthority === 'MANUAL' ? 'MANUAL_AUDIT' : 'GPS_RIDE_ESTIMATE'
      segment.confidence = trip.tripKmAuthority === 'MANUAL' ? 'AUTHORITATIVE' : 'ESTIMATED_ROAD_TRACE'
      segment.authority = trip.tripKmAuthority === 'MANUAL' ? 'MANUAL_AUDIT' : 'GPS_ESTIMATE'
    }
    const classifiedKm = reconciledSegments.filter(s => (s.classification === 'DEAD' || s.classification === 'BUSINESS') && finite(s.distanceKm)).reduce((t, s) => t + Number(s.distanceKm), 0)
    const remainderKm = Math.max(0, totalShiftVehicleKm - classifiedKm)
    if (classifiedKm - totalShiftVehicleKm > EPSILON_KM) return { ...base, segments: reconciledSegments, totalShiftVehicleKm, manualBusinessKmByTripId: Object.fromEntries(manualByTrip), deadMilesKm: sum(reconciledSegments, 'DEAD'), businessMilesKm: sum(reconciledSegments, 'BUSINESS'), unclassifiedKm: 0, reconciliationDifferenceKm: totalShiftVehicleKm - classifiedKm, reconciliationStatus: 'OVER_ESTIMATE', personalKmInShift: 0, authoritativeOdometerKm: totalShiftVehicleKm }
    if (remainderKm > EPSILON_KM) reconciledSegments.push({ id: 'SHIFT_RECONCILIATION_REMAINDER', tripId: null, label: 'SHIFT_RECONCILIATION_REMAINDER', classification: 'DEAD', authority: 'ODOMETER_REMAINDER', distanceKm: remainderKm, method: 'ODOMETER_RECONCILIATION', confidence: 'AUTHORITATIVE_REMAINDER', roadMatchedGeometry: null, traceGeometry: [] })
    return { ...base, segments: reconciledSegments, totalShiftVehicleKm, manualBusinessKmByTripId: Object.fromEntries(manualByTrip), deadMilesKm: sum(reconciledSegments, 'DEAD'), businessMilesKm: sum(reconciledSegments, 'BUSINESS'), unclassifiedKm: 0, reconciliationDifferenceKm: 0, reconciliationStatus: 'RECONCILED', personalKmInShift: 0, authoritativeOdometerKm: totalShiftVehicleKm }
  },
  calculateDeadMiles(options = {}) { return this.calculateSegments(options) },
}
