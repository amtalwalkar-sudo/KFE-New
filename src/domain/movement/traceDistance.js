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

export const calculateTraceDistanceKm = tracePoints => (tracePoints || []).reduce(
  (total, point, index, list) => total + (index ? segmentKm(list[index - 1], point) : 0),
  0
)
