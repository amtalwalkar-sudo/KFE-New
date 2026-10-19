import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'

const vectorPath = 'spec/work-domain/shift-start-golden-vectors.json'
const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'))
assert.equal(vectors.schemaVersion, 1, 'Golden vector schema must be explicitly versioned.')
assert.ok(Array.isArray(vectors.cases) && vectors.cases.length >= 10, 'The shared vector suite must cover the required edge cases.')

const reasonCodes = new Map([
  ['Enter a valid current odometer.', 'INVALID_CURRENT_ODOMETER'],
  ['CLOSING_ODOMETER_REQUIRED', 'CLOSING_ODOMETER_REQUIRED'],
  ['Closing odometer cannot be lower than the shift opening odometer.', 'CLOSING_ODOMETER_BELOW_START'],
  ['Current odometer cannot be lower than the last recorded odometer.', 'BELOW_PREVIOUS_ODOMETER'],
  ['Current odometer cannot be lower than the business start odometer.', 'BELOW_BUSINESS_START_ODOMETER'],
  ['Closing odometer is unusually high above shift opening. Confirm this unusually high daily distance before ending the Shift.', 'LARGE_DISTANCE_CONFIRMATION_REQUIRED']
])
const normalize = result => {
  const normalized = {}
  for (const key of ['valid','gapKm','historicalKm','businessStartOdometer','historicalOdometerGap','requiresGapAllocation','category','personalKm','deadKm','closingOdometer','distanceKm','requiresConfirmation']) {
    if (Object.hasOwn(result, key)) normalized[key] = result[key]
  }
  if (result.reason) normalized.reasonCode = reasonCodes.get(result.reason) || 'GAP_ALLOCATION_REQUIRED'
  else if (result.valid === false && result.requiresGapAllocation) normalized.reasonCode = 'GAP_ALLOCATION_REQUIRED'
  return normalized
}
const evaluators = {
  validateShiftStartOdometer: input => validateShiftStartOdometer(input.currentOdometer, input.previousOdometer),
  validateFirstDayShiftStartOdometer: input => validateFirstDayShiftStartOdometer(input.currentOdometer, input.businessStartOdometer),
  validateGapAllocation: input => validateGapAllocation(input.gapKm, input.category),
  validateEndShiftEntry: input => validateEndShiftEntry(input)
}
for (const vector of vectors.cases) {
  assert.ok(evaluators[vector.rule], `Unknown rule in vector ${vector.id}`)
  assert.deepEqual(normalize(evaluators[vector.rule](vector.input)), vector.expected, `Shared work-domain vector failed: ${vector.id}`)
}

assert.deepEqual(
  normalize(validateShiftStartOdometer('120', '100')),
  { valid: true, gapKm: 20 },
  'The shared rule source must preserve numeric-string PWA form inputs.'
)
assert.deepEqual(
  normalize(validateFirstDayShiftStartOdometer('125', '100')),
  { valid: true, gapKm: 25, historicalKm: 25, businessStartOdometer: 100, historicalOdometerGap: true },
  'The shared rule source must normalize numeric-string historical baselines.'
)
assert.deepEqual(
  normalize(validateGapAllocation(null, null)),
  { valid: false, requiresGapAllocation: true, gapKm: Number.NaN, reasonCode: 'GAP_ALLOCATION_REQUIRED' },
  'Missing gap distance must remain invalid rather than being coerced to zero.'
)

console.log(`Shared work-domain golden vectors passed: ${vectors.cases.length} plus runtime input edge cases`)
