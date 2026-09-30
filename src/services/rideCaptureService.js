import { normalizeTripInput } from '../domain/canonicalNormalization.js'
import { ShiftTripRepository } from '../repositories/shiftTripRepository.js'
import { RIDE_CAPTURE_FIELDS } from './adapters/rideCaptureAdapter.js'

const finiteNonNegative = (value, field) => {
  const result = Number(value)
  if (!Number.isFinite(result) || result < 0) throw new Error(`${field} must be a non-negative finite number.`)
  return result
}

const requireTimestamp = (value, field) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) throw new Error(`${field} must be a valid timestamp.`)
  return new Date(value).toISOString()
}

const validateExtractedRide = extracted => {
  if (!extracted || typeof extracted !== 'object') throw new Error('Ride extraction must return an object.')
  const status = String(extracted.status || 'COMPLETED').toUpperCase()
  if (!['COMPLETED', 'CANCELLED'].includes(status)) throw new Error(`Unsupported extracted ride status: ${status}`)
  const normalized = normalizeTripInput({
    operator: extracted.operator,
    tripStartAt: extracted.rideStartAt,
    tripEndAt: extracted.rideEndAt,
    tripStartLocation: extracted.pickup,
    tripEndLocation: extracted.drop,
    tripKm: extracted.distanceKm,
    revenue: extracted.fare,
    tripKmProvenance: 'OCR_MULTIMODAL',
    revenueProvenance: 'OCR_MULTIMODAL'
  })
  if (!normalized.operator) throw new Error('Extracted ride operator is required.')
  if (!normalized.tripStartLocation) throw new Error('Extracted pickup location is required.')
  if (!normalized.tripEndLocation) throw new Error('Extracted drop location is required.')
  normalized.tripStartAt = requireTimestamp(normalized.tripStartAt, 'rideStartAt')
  normalized.tripEndAt = requireTimestamp(normalized.tripEndAt, 'rideEndAt')
  if (new Date(normalized.tripEndAt) < new Date(normalized.tripStartAt)) throw new Error('rideEndAt cannot be before rideStartAt.')
  normalized.tripKm = finiteNonNegative(normalized.tripKm, 'distanceKm')
  normalized.revenue = finiteNonNegative(normalized.revenue, 'fare')
  return { ...normalized, status, durationMinutes: Number.isFinite(Number(extracted.durationMinutes)) ? Number(extracted.durationMinutes) : Math.round((new Date(normalized.tripEndAt) - new Date(normalized.tripStartAt)) / 60000), cancelReason: extracted.cancelReason || null }
}

export const RideCaptureService = {
  async extractScreenshot(adapter, image) {
    if (!adapter || typeof adapter.extractScreenshot !== 'function') throw new TypeError('A Ride Capture adapter is required.')
    if (!image) throw new Error('A ride screenshot is required.')
    const extracted = await adapter.extractScreenshot({ image, fields: RIDE_CAPTURE_FIELDS })
    return validateExtractedRide(extracted)
  },

  async confirm(shiftId, extractedRide) {
    if (!shiftId) throw new Error('shiftId is required to confirm a captured ride.')
    const ride = validateExtractedRide(extractedRide)
    const created = await ShiftTripRepository.createTrip({
      shiftId,
      operator: ride.operator,
      tripStartAt: ride.tripStartAt,
      tripStartLocation: ride.tripStartLocation,
      tripKm: ride.tripKm,
      revenue: ride.revenue,
      tripKmProvenance: 'OCR_MULTIMODAL',
      revenueProvenance: 'OCR_MULTIMODAL'
    })
    if (ride.status === 'CANCELLED') {
      await ShiftTripRepository.cancelTrip({ id: created.id, tripEndAt: ride.tripEndAt, tripEndLocation: ride.tripEndLocation, revenue: ride.revenue, reason: ride.cancelReason || 'OCR_CAPTURED' })
    } else {
      await ShiftTripRepository.completeTrip({ id: created.id, tripEndAt: ride.tripEndAt, tripEndLocation: ride.tripEndLocation })
    }
    return { ...created, tripEndAt: ride.tripEndAt, tripEndLocation: ride.tripEndLocation, status: ride.status, tripKm: ride.tripKm, revenue: ride.revenue, durationMinutes: ride.durationMinutes }
  }
}
