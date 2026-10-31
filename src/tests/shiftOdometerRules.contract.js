import assert from 'node:assert/strict'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer } from '../domain/work/shift.js'
import { validateEndShiftEntry, LARGE_DISTANCE_WARNING_KM } from '../domain/work/endShift.js'

assert.deepEqual(validateShiftStartOdometer('120', '100'), { valid: true })
assert.deepEqual(validateShiftStartOdometer('100', '100'), { valid: true })
assert.deepEqual(validateShiftStartOdometer('99', '100'), { valid: false, reason: 'Current odometer cannot be lower than the last recorded odometer.' })
assert.deepEqual(validateShiftStartOdometer('not-a-number', '100'), { valid: false, reason: 'Enter a valid current odometer.' })
assert.deepEqual(validateShiftStartOdometer('0', null), { valid: false, reason: 'Enter a valid current odometer.' })
assert.deepEqual(validateFirstDayShiftStartOdometer('125', '100'), { valid: true })
assert.deepEqual(validateFirstDayShiftStartOdometer('99', '100'), { valid: false, reason: 'Current odometer cannot be lower than the business start odometer.' })
assert.deepEqual(validateFirstDayShiftStartOdometer('125', null), { valid: true })
assert.deepEqual(validateEndShiftEntry({ closingOdometer: '120', startOdometer: '100' }), { valid: true, closingOdometer: 120, distanceKm: 20 })
assert.deepEqual(validateEndShiftEntry({ closingOdometer: '   ', startOdometer: 100 }), { valid: false, reason: 'CLOSING_ODOMETER_REQUIRED' })
assert.deepEqual(validateEndShiftEntry({ closingOdometer: -1, startOdometer: 100 }), { valid: false, reason: 'CLOSING_ODOMETER_REQUIRED' })
assert.deepEqual(validateEndShiftEntry({ closingOdometer: 99, startOdometer: 100 }), { valid: false, reason: 'Closing odometer cannot be lower than the shift opening odometer.' })
assert.equal(LARGE_DISTANCE_WARNING_KM, 500)
assert.deepEqual(validateEndShiftEntry({ closingOdometer: '600', startOdometer: 100 }), {
  valid: false,
  reason: 'Closing odometer is 500 km above shift opening. Confirm this unusually high daily distance before ending the Shift.',
  distanceKm: 500,
  requiresConfirmation: true,
})
assert.deepEqual(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100, confirmLargeDistance: true }), { valid: true, closingOdometer: 601, distanceKm: 501 })
console.log('Shift odometer validation contract: PASS')
