import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'

const vectorPath = 'spec/work-domain/shift-start-golden-vectors.json'
const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8'))
assert.equal(vectors.schemaVersion, 1, 'Golden vector schema must be explicitly versioned.')
assert.ok(Array.isArray(vectors.cases) && vectors.cases.length >= 10, 'The shared vector suite must cover the required edge cases.')

const reasonCodes = new Map([
  ['Enter a valid current odometer.', 'INVALID_CURRENT_ODOMETER'],
  ['Current odometer cannot be lower than the last recorded odometer.', 'BELOW_PREVIOUS_ODOMETER'],
  ['Current odometer cannot be lower than the business start odometer.', 'BELOW_BUSINESS_START_ODOMETER']
])
const normalize = result => {
  const normalized = {}
  for (const key of ['valid','gapKm','historicalKm','businessStartOdometer','historicalOdometerGap','requiresGapAllocation','category','personalKm','deadKm']) {
    if (Object.hasOwn(result, key)) normalized[key] = result[key]
  }
  if (result.reason) normalized.reasonCode = reasonCodes.get(result.reason) || 'GAP_ALLOCATION_REQUIRED'
  else if (result.valid === false && result.requiresGapAllocation) normalized.reasonCode = 'GAP_ALLOCATION_REQUIRED'
  return normalized
}
const evaluators = {
  validateShiftStartOdometer: input => validateShiftStartOdometer(input.currentOdometer, input.previousOdometer),
  validateFirstDayShiftStartOdometer: input => validateFirstDayShiftStartOdometer(input.currentOdometer, input.businessStartOdometer),
  validateGapAllocation: input => validateGapAllocation(input.gapKm, input.category)
}
for (const vector of vectors.cases) {
  assert.ok(evaluators[vector.rule], `Unknown rule in vector ${vector.id}`)
  assert.deepEqual(normalize(evaluators[vector.rule](vector.input)), vector.expected, `Shared shift-start vector failed: ${vector.id}`)
}
console.log(`Shared shift-start golden vectors passed: ${vectors.cases.length}`)
