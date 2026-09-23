import assert from 'node:assert/strict'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { WORK_TRIP_OPERATORS, validateTripOperator, validateTripCorrection, calculateTripRevenueDetail } from '../domain/work/trip.js'
import { calculateFuelQuantity, validateFuelEntry } from '../domain/work/fuel.js'
import { WorkService } from '../application/work/workService.js'

assert.equal(typeof WorkService.getTripGpsDistanceKm, 'function')
assert.deepEqual(validateShiftStartOdometer(100, 90), { valid: true, gapKm: 10 })
assert.equal(validateShiftStartOdometer(89, 90).valid, false)
assert.deepEqual(validateFirstDayShiftStartOdometer(68500, 65000), { valid: true, gapKm: 0, historicalKm: 3500, businessStartOdometer: 65000, historicalOdometerGap: true })
assert.deepEqual(validateFirstDayShiftStartOdometer(65000, 65000), { valid: true, gapKm: 0, historicalKm: 0, businessStartOdometer: 65000, historicalOdometerGap: false })
assert.equal(validateFirstDayShiftStartOdometer(64999, 65000).valid, false)
assert.deepEqual(validateGapAllocation(180, 'PERSONAL'), { valid: true, category: 'PERSONAL', personalKm: 180, deadKm: 0 })
assert.deepEqual(validateGapAllocation(180, 'DEAD'), { valid: true, category: 'DEAD', personalKm: 0, deadKm: 180 })
assert.equal(validateGapAllocation(180).valid, false)
assert.equal(validateGapAllocation(180, 'PERSONAL').personalKm + validateGapAllocation(180, 'PERSONAL').deadKm, 180)
assert.equal(validateGapAllocation(180, 'DEAD').personalKm + validateGapAllocation(180, 'DEAD').deadKm, 180)
assert.deepEqual(validateGapAllocation(0), { valid: true, category: null, personalKm: 0, deadKm: 0 })
assert.equal(validateEndShiftEntry({ closingOdometer: 100, startOdometer: 100, revenue: 0 }).valid, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 99, startOdometer: 100, revenue: 0 }).valid, false)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100, revenue: 0 }).requiresConfirmation, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100, revenue: 0 }).valid, false)
assert.equal(validateEndShiftEntry({ closingOdometer: 600, startOdometer: 100, revenue: 0, confirmLargeDistance: true }).valid, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 600, startOdometer: 100, revenue: 0 }).distanceKm, 500)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100, revenue: 0 }).requiresConfirmation, true)
assert.deepEqual(WORK_TRIP_OPERATORS, ['Uber', 'One way', 'Rapido', 'Ola', 'Savaari'])
assert.equal(validateTripOperator('Uber').valid, true)
assert.equal(validateTripOperator('Unknown').valid, false)
assert.equal(validateTripCorrection({ operator: 'Ola', tripKm: '12.5', revenue: '300' }).valid, true)
assert.deepEqual(validateTripCorrection({ operator: 'Ola', revenue: '150', cancelReason: 'PASSENGER_CANCELLED' }), { valid: true, operator: 'Ola', revenue: 150, cancelReason: 'PASSENGER_CANCELLED' })
assert.equal(validateTripCorrection({ cancelReason: '' }).valid, false)
assert.equal(calculateTripRevenueDetail([{ status: 'COMPLETED', revenue: 100 }, { status: 'CANCELLED', revenue: 500 }, { status: 'COMPLETED', revenue: null }]), 100)
assert.equal(calculateFuelQuantity({ pricePerKg: 82, amount: 410 }).quantityKg, 5)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230 }).quantityKg, 15)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230.01 }).valid, false)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230.01 }).reason, 'FUEL_QUANTITY_EXCEEDS_TANK_CAPACITY_15KG')

console.log('KFE Work contract tests: PASS')
