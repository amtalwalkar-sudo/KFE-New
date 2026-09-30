/**
 * Calculates distance traveled from start and end odometer readings.
 * @param {number|string} startOdo
 * @param {number|string} endOdo
 * @returns {number|null}
 */
export function calculateDistanceKm(startOdo, endOdo) {
  const start = Number(startOdo)
  const end = Number(endOdo)
  if (isNaN(start) || isNaN(end) || end < start) return null
  return end - start
}
