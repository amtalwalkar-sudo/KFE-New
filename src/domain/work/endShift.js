import { evaluateShiftStartRule } from './shiftStartRuleInterpreter.js'

const LARGE_DISTANCE_WARNING_KM = 500

const reasonMessages = {
  CLOSING_ODOMETER_REQUIRED: 'CLOSING_ODOMETER_REQUIRED',
  CLOSING_ODOMETER_BELOW_START: 'Closing odometer cannot be lower than the shift opening odometer.',
  LARGE_DISTANCE_CONFIRMATION_REQUIRED: 'Closing odometer is unusually high above shift opening. Confirm this unusually high daily distance before ending the Shift.'
}

function preservePwaResult(result) {
  if (!result.reasonCode) return result
  const { reasonCode, ...fields } = result
  return { ...fields, reason: reasonMessages[reasonCode] || reasonCode }
}

export function validateEndShiftEntry({ closingOdometer, startOdometer, confirmLargeDistance = false }) {
  // Preserve the legacy Number(null)/Number('') baseline semantics while keeping
  // an absent baseline (undefined) distinct from an explicit zero baseline.
  const normalizedStart = startOdometer === null || (typeof startOdometer === 'string' && startOdometer.trim() === '')
    ? 0
    : startOdometer
  return preservePwaResult(evaluateShiftStartRule('validateEndShiftEntry', {
    closingOdometer,
    startOdometer: normalizedStart,
    confirmLargeDistance
  }))
}

export { LARGE_DISTANCE_WARNING_KM }
