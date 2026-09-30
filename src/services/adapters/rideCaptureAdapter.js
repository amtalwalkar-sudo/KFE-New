// Provider-independent Ride Capture adapter contract.
// A concrete multimodal/OCR provider is injected at runtime in a later integration.
export const createRideCaptureAdapter = ({ extract }) => {
  if (typeof extract !== 'function') throw new TypeError('Ride Capture adapter requires an extract function.')
  return { async extractScreenshot(input) { return extract(input) } }
}

export const RIDE_CAPTURE_FIELDS = Object.freeze([
  'operator',
  'status',
  'pickup',
  'drop',
  'rideStartAt',
  'rideEndAt',
  'durationMinutes',
  'distanceKm',
  'fare',
  'cancelReason'
])
