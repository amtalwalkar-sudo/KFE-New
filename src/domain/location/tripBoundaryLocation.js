/**
 * Pure validation for a single provider fix. No platform or persistence access.
 */
export const normalizeTripBoundaryLocation = value => {
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null
  const accuracy = value?.accuracy == null || value.accuracy === '' ? null : Number(value.accuracy)
  const timestamp = value?.capturedAt ?? value?.timestamp
  if (timestamp == null || timestamp === '') return null
  const fixDate = new Date(timestamp)
  if (!Number.isFinite(fixDate.getTime()) || fixDate.getTime() <= 0) return null
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) return null
  return { latitude, longitude, accuracy, capturedAt: fixDate.toISOString() }
}
