import { evaluateShiftStartRule } from './shiftStartRuleInterpreter.js'

const reasonMessages = {
  INVALID_CURRENT_ODOMETER: 'Enter a valid current odometer.',
  BELOW_PREVIOUS_ODOMETER: 'Current odometer cannot be lower than the last recorded odometer.',
  BELOW_BUSINESS_START_ODOMETER: 'Current odometer cannot be lower than the business start odometer.',
  GAP_ALLOCATION_REQUIRED: null
}

function preservePwaResult(result) {
  if (!result.reasonCode) return result
  const { reasonCode, ...fields } = result
  const message = reasonMessages[reasonCode]
  if (message) return { ...fields, reason: message }
  return fields
}

export function validateShiftStartOdometer(currentOdometer, previousOdometer = null) {
  return preservePwaResult(evaluateShiftStartRule('validateShiftStartOdometer', {
    currentOdometer,
    previousOdometer
  }))
}

export function validateFirstDayShiftStartOdometer(currentOdometer, businessStartOdometer = null) {
  return preservePwaResult(evaluateShiftStartRule('validateFirstDayShiftStartOdometer', {
    currentOdometer,
    businessStartOdometer
  }))
}

export function validateGapAllocation(gapKm, category = null) {
  return preservePwaResult(evaluateShiftStartRule('validateGapAllocation', { gapKm, category }))
}
