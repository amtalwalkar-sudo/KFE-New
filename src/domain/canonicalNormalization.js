const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const number = (value, field) => { if (value === null || value === undefined || value === '') return null; const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} must be a finite number.`); return result }
const first = (...values) => values.find(value => value !== null && value !== undefined && value !== '')

export const normalizeShiftInput = input => {
  const value = { ...input }
  value.startOdometer = number(first(input.startOdometer, input.start_odometer, input.openingOdometer, input.opening_odometer), 'startOdometer')
  if (first(input.endOdometer, input.end_odometer, input.closingOdometer, input.closing_odometer) !== undefined) value.endOdometer = number(first(input.endOdometer, input.end_odometer, input.closingOdometer, input.closing_odometer), 'endOdometer')
  for (const [canonical, aliases] of Object.entries({ openingPersonalKm: ['opening_personal_km'], openingDeadKm: ['opening_dead_km'], openingPersonalToll: ['opening_personal_toll'], openingPersonalParking: ['opening_personal_parking'], totalDistance: ['total_distance'], revenue: ['fare', 'amount'], toll: ['tollCost', 'toll_cost'], parking: ['parkingCost', 'parking_cost'] })) {
    const source = first(input[canonical], ...aliases.map(key => input[key])); if (source !== undefined && source !== null && source !== '') value[canonical] = number(source, canonical); for (const alias of aliases) delete value[alias]
  }
  value.shiftStartAt = first(input.shiftStartAt, input.shift_start_at, input.startAt, input.start_at) ?? input.shiftStartAt
  value.shiftEndAt = first(input.shiftEndAt, input.shift_end_at, input.endAt, input.end_at) ?? input.shiftEndAt
  for (const key of ['start_odometer','end_odometer','openingOdometer','opening_odometer','closingOdometer','closing_odometer']) delete value[key]
  return value
}

export const normalizeTripInput = input => {
  const value = { ...input }
  const aliases = { tripStartAt: ['trip_start_at', 'startAt', 'start_at'], tripEndAt: ['trip_end_at', 'endAt', 'end_at'], tripKm: ['trip_km', 'distanceKm', 'distance_km'], revenue: ['fare', 'amount', 'totalFare', 'total_fare'], toll: ['tollCost', 'toll_cost'], parking: ['parkingCost', 'parking_cost'] }
  for (const [canonical, candidates] of Object.entries(aliases)) { const source = first(input[canonical], ...candidates.map(key => input[key])); if (source !== undefined && source !== null && source !== '') value[canonical] = ['tripKm', 'revenue', 'toll', 'parking'].includes(canonical) ? number(source, canonical) : source; for (const alias of candidates) delete value[alias] }
  if (input.tripKmProvenance !== undefined) value.tripKmProvenance = input.tripKmProvenance
  if (input.revenueProvenance !== undefined) value.revenueProvenance = input.revenueProvenance
  if (input.cancelReason !== undefined) value.cancelReason = String(input.cancelReason)
  return value
}

export const normalizeFuelInput = input => {
  const value = { ...input }
  const aliases = { capturedAt: ['createdAt', 'created_at'], amount: ['totalCost', 'total_cost'], quantityKg: ['kg', 'quantity_kg'], pricePerKg: ['price_per_kg'], odometer: ['odometerKm', 'odometer_km'] }
  for (const [canonical, candidates] of Object.entries(aliases)) { const source = first(input[canonical], ...candidates.map(key => input[key])); if (source !== undefined && source !== null && source !== '') value[canonical] = ['amount', 'quantityKg', 'pricePerKg', 'odometer'].includes(canonical) ? number(source, canonical) : source; for (const alias of candidates) delete value[alias] }
  if (input.provenance !== undefined) value.provenance = input.provenance
  return value
}

export const normalizeNumericFields = (record, fields) => { const value = { ...record }; for (const field of fields) if (value[field] !== undefined && value[field] !== null && value[field] !== '') value[field] = number(value[field], field); return value }
export const isFiniteCanonicalNumber = finite
