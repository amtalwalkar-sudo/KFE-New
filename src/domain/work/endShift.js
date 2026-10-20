import { evaluateShiftStartRule } from './shiftStartRuleInterpreter.js'

const LARGE_DISTANCE_WARNING_KM = 500

function preservePwaResult(result) {
  if (!result.reasonCode) return result
  const { reasonCode, ...fields } = result
  if (reasonCode === 'CLOSING_ODOMETER_REQUIRED') {
    return { ...fields, reason: 'CLOSING_ODOMETER_REQUIRED' }
  }
  if (reasonCode === 'CLOSING_ODOMETER_BELOW_START') {
    return { ...fields, reason: 'Closing odometer cannot be lower than the shift opening odometer.' }
  }
  if (reasonCode === 'LARGE_DISTANCE_CONFIRMATION_REQUIRED') {
    return {
      ...fields,
      reason: `Closing odometer is ${fields.distanceKm} km above shift opening. Confirm this unusually high daily distance before ending the Shift.`
    }
  }
  return { ...fields, reason: reasonCode }
}

export function validateEndShiftEntry({ closingOdometer, startOdometer, confirmLargeDistance = false }) {
  // Preserve the legacy Number(null)/Number('') baseline semantics while keeping
  // an absent baseline (undefined) distinct from an explicit zero baseline.
  const normalizedStart = startOdometer === null || (typeof startOdometer === 'string' && startOdometer.trim() === '')
    ? 0
    : startOdometer
  const normalizedClosing = closingOdometer == null || (typeof closingOdometer === 'string' && closingOdometer.trim() === '')
    ? null
    : closingOdometer
  return preservePwaResult(evaluateShiftStartRule('validateEndShiftEntry', {
    closingOdometer: normalizedClosing,
    startOdometer: normalizedStart,
    confirmLargeDistance
  }))
}

export { LARGE_DISTANCE_WARNING_KM }
