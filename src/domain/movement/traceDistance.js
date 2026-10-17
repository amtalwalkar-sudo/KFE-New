const segmentKm = (a, b) => {
  if (!a || !b) return 0
  const toRadians = value => Number(value) * Math.PI / 180
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const dLat = lat2 - lat1
  const dLon = toRadians(b.longitude) - toRadians(a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

const MAX_CONTIGUOUS_TRACE_GAP_MS = 120000
const capturedAtMs = point => {
  const value = point?.capturedAt || point?.timestamp
  if (value == null || value === '') return NaN
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : NaN
}

// Never count the chord between points across a long recording outage as driven KM.
// The first fix after a gap becomes the new anchor; the gap is accounted separately.
export const calculateTraceDistanceKm = tracePoints => (tracePoints || []).reduce(
  (total, point, index, list) => {
    if (!index) return total
    const previous = list[index - 1]
    const previousAt = capturedAtMs(previous)
    const pointAt = capturedAtMs(point)
    if (Number.isFinite(previousAt) && Number.isFinite(pointAt) && pointAt - previousAt > MAX_CONTIGUOUS_TRACE_GAP_MS) return total
    return total + segmentKm(previous, point)
  },
  0
)
