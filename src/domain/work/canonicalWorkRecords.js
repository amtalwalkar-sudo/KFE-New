import { normalizeShiftInput, normalizeTripInput } from '../canonicalNormalization.js'

const requireFinite = (value, field) => {
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error(`${field} must be a finite number.`)
  return result
}

const requireCreateId = createId => {
  if (typeof createId !== 'function') throw new TypeError('createId must be a function.')
  return createId
}

/**
 * Build the canonical Shift shape once for both browser and Android persistence.
 * Platform-specific ID generation and the commit itself remain outside the domain.
 */
export const createCanonicalShiftRecord = (data, { createId, now = new Date().toISOString() } = {}) => {
  const normalized = normalizeShiftInput(data)
  const makeId = requireCreateId(createId)
  const startOdometer = requireFinite(normalized.startOdometer, 'startOdometer')
  if (startOdometer < 0) throw new Error('startOdometer cannot be negative.')
  return {
    id: normalized.id || makeId(),
    startOdometer,
    endOdometer: null,
    totalDistance: 0,
    revenue: 0,
    shiftStartAt: normalized.shiftStartAt || now,
    shiftEndAt: null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Build the canonical Trip shape once for both browser and Android persistence.
 * Lifecycle transitions and storage commits remain owned by their existing layers.
 */
export const createCanonicalTripRecord = (data, { createId, now = new Date().toISOString() } = {}) => {
  const normalized = normalizeTripInput(data)
  const makeId = requireCreateId(createId)
  if (!normalized.shiftId) throw new Error('shiftId is required for a Trip.')
  return {
    id: normalized.id || makeId(),
    shiftId: normalized.shiftId,
    operator: normalized.operator,
    tripStartAt: normalized.tripStartAt || null,
    tripEndAt: null,
    status: 'ACTIVE',
    tripStage: normalized.tripStage || 'GOING_TO_PICKUP',
    toll: normalized.toll ?? 0,
    parking: normalized.parking ?? 0,
    revenue: normalized.revenue ?? null,
    fareDetailsSkipped: false,
    cancelledRevenue: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
  }
}
