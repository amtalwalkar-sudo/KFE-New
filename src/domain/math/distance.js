export function calculateDistanceKm(startReading, endReading) {
  const start = Number(startReading)
  const end = Number(endReading)
  if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || end < start) {
    return null
  }
  return end - start
}
