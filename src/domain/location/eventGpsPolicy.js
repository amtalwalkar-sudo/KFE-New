export const EVENT_GPS_CAPTURE_WINDOW_MS = 30_000

const timestamp = value => {
  if (value == null || value === '') return NaN
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN
}

export const isValidEventGpsTimestamp = (eventAt, capturedAt) => {
  const eventTime = timestamp(eventAt)
  const fixTime = timestamp(capturedAt)
  return Number.isFinite(eventTime) && Number.isFinite(fixTime)
    && fixTime >= eventTime
    && fixTime - eventTime < EVENT_GPS_CAPTURE_WINDOW_MS
}

export const remainingEventGpsCaptureWindowMs = (eventAt, now = Date.now()) => {
  const eventTime = timestamp(eventAt)
  if (!Number.isFinite(eventTime) || !Number.isFinite(now) || now < eventTime) return 0
  return Math.max(0, EVENT_GPS_CAPTURE_WINDOW_MS - (now - eventTime))
}
