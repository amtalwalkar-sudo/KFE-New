import assert from 'node:assert/strict'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { MovementAccountingService } from '../domain/movement/movementAccounting.js'
import { calculateFuelQuantity, validateFuelEntry } from '../domain/work/fuel.js'
import { transitionTrip, TRIP_STATES } from '../domain/work/tripLifecycle.js'
import { PerformanceService } from '../application/performance/performanceService.js'

const sourceSha = '4521a6c3b05d84aff6dc2e0afa95db6159c88695'
const shiftId = 'SIM-PILOT-SHIFT-001'
const trip1 = {
  id: 'SIM-PILOT-TRIP-001', shiftId, status: 'ACTIVE',
  operator: 'DRIVER', tripStartAt: '2026-09-26T08:10:00Z', tripEndAt: '2026-09-26T08:40:00Z',
  tripStartLocation: { latitude: 19.0760, longitude: 72.8777, accuracy: 8, capturedAt: '2026-09-26T08:10:00Z' },
  tripEndLocation: { latitude: 19.0896, longitude: 72.8656, accuracy: 9, capturedAt: '2026-09-26T08:40:00Z' }
}
const trip2 = {
  id: 'SIM-PILOT-TRIP-002', shiftId, status: 'ACTIVE',
  operator: 'DRIVER', tripStartAt: '2026-09-26T09:10:00Z', tripEndAt: '2026-09-26T09:40:00Z',
  tripStartLocation: { latitude: 19.0896, longitude: 72.8656, accuracy: 7, capturedAt: '2026-09-26T09:10:00Z' },
  tripEndLocation: { latitude: 19.1050, longitude: 72.8750, accuracy: 8, capturedAt: '2026-09-26T09:40:00Z' }
}
const cancelled = {
  id: 'SIM-PILOT-TRIP-003', shiftId, status: 'ACTIVE',
  operator: 'DRIVER', tripStartAt: '2026-09-26T10:10:00Z', tripEndAt: '2026-09-26T10:15:00Z',
  tripStartLocation: trip2.tripEndLocation,
  tripEndLocation: { latitude: 19.1055, longitude: 72.8755, accuracy: 8, capturedAt: '2026-09-26T10:15:00Z' }
}

const completed1 = transitionTrip(trip1, TRIP_STATES.COMPLETED, {
  tripEndAt: trip1.tripEndAt, tripEndLocation: trip1.tripEndLocation,
  tripKm: 18, tripKmAuthority: 'GPS_LINE_TRACE', tripKmProvenance: { method: 'SIMULATED_TRACE' }
})
completed1.revenue = 1200
completed1.revenueAuthority = 'SUPPORTING_ONLY'

const completed2 = transitionTrip(trip2, TRIP_STATES.COMPLETED, {
  tripEndAt: trip2.tripEndAt, tripEndLocation: trip2.tripEndLocation,
  tripKm: 12, tripKmAuthority: 'GPS_LINE_TRACE', tripKmProvenance: { method: 'SIMULATED_TRACE' }
})
completed2.revenue = 800
completed2.revenueAuthority = 'SUPPORTING_ONLY'

const cancelledTrip = transitionTrip(cancelled, TRIP_STATES.CANCELLED, {
  tripEndAt: cancelled.tripEndAt, tripEndLocation: cancelled.tripEndLocation,
  revenue: 0, reason: 'PASSENGER_CANCELLED'
})

const trips = [completed1, completed2, cancelledTrip]

const gpsSnapshots = [
  { latitude: 19.0760, longitude: 72.8777, accuracy: 8, speed: 0, capturedAt: '2026-09-26T08:10:00Z' },
  { latitude: 19.0830, longitude: 72.8720, accuracy: 9, speed: 25, capturedAt: '2026-09-26T08:20:00Z' },
  { latitude: 19.0896, longitude: 72.8656, accuracy: 9, speed: 28, capturedAt: '2026-09-26T08:40:00Z' },
  { latitude: 19.0896, longitude: 72.8656, accuracy: 7, speed: 0, capturedAt: '2026-09-26T09:10:00Z' },
  { latitude: 19.0970, longitude: 72.8700, accuracy: 8, speed: 27, capturedAt: '2026-09-26T09:25:00Z' },
  { latitude: 19.1050, longitude: 72.8750, accuracy: 8, speed: 25, capturedAt: '2026-09-26T09:40:00Z' },
  { latitude: 19.1055, longitude: 72.8755, accuracy: 8, speed: 12, capturedAt: '2026-09-26T10:15:00Z' }
]

const movement = await MovementAccountingService.reconcileShiftMovement({
  garageLocation: { latitude: 19.0760, longitude: 72.8777, accuracy: 8 },
  trips,
  startOdometer: 65000,
  endOdometer: 65055,
  router: null,
  businessKmByTripId: { [completed1.id]: 18, [completed2.id]: 12 },
  gpsSnapshots
})

assert.equal(movement.reconciliationStatus, 'RECONCILED')
assert.equal(movement.authoritativeOdometerKm, 55)
assert.equal(movement.businessMilesKm, 30)
assert.ok(movement.deadMilesKm >= 0)
assert.equal(movement.cancelledMilesKm >= 0, true)
assert.ok(movement.gpsTracePoints >= 7)

const revenue = reconcileShiftRevenue({
  shiftRevenue: 2000,
  trips,
  toll: 120,
  parking: 30,
  tollParkingRevenueTreatment: 'INCLUDED'
})
assert.equal(revenue.reconciliationStatus, 'RECONCILED')
assert.equal(revenue.tripRevenue, 2000)
assert.equal(revenue.difference, 0)
assert.equal(revenue.financialRevenue, 1850)
assert.equal(revenue.includedPassThrough, 150)

const fuel = calculateFuelQuantity({ pricePerKg: 100, amount: 1500 })
assert.equal(fuel.valid, true)
assert.equal(fuel.quantityKg, 15)
const fuelValidation = validateFuelEntry({ odometer: 65042, pricePerKg: 100, amount: 1500, isFullTank: true })
assert.equal(fuelValidation.valid, true)

const snapshot = {
  trips,
  shifts: [{
    id: shiftId, shiftStartAt: '2026-09-26T08:00:00Z', shiftEndAt: '2026-09-26T18:00:00Z',
    startOdometer: 65000, endOdometer: 65055, toll: 120, parking: 30,
    tollParkingRevenueTreatment: 'INCLUDED', revenue: 2000
  }],
  fuelLogs: [\n    { capturedAt: '2026-09-24T18:00:00Z', odometer: 64600, quantityKg: 10, amount: 1000, isFullTank: true, vehicleId: 'v1' },\n    { capturedAt: '2026-09-25T18:00:00Z', odometer: 64800, quantityKg: 10, amount: 1000, isFullTank: true, vehicleId: 'v1' },\n    { capturedAt: '2026-09-26T07:30:00Z', odometer: 65000, quantityKg: 10, amount: 1000, isFullTank: true, vehicleId: 'v1' },\n    { capturedAt: '2026-09-26T10:30:00Z', odometer: 65042, quantityKg: 15, amount: 1500, isFullTank: true, vehicleId: 'v1' }\n  ],
  maintenance: [{ performedOn: '2026-09-26', cost: 250 }],
  loans: [{ id: 'loan1', principal: 550000, annualInterestRate: 10, tenureMonths: 60, startDate: '2026-09-01' }], loanPayments: [], prepayments: [],
  compliance: [{ type: 'insurance', validFrom: '2026-01-01', validUntil: '2026-12-31', cost: 24000 }],
  breakEvenInputs: [{ effectiveFrom: '2026-09-01', maintenanceProvisionPerKm: 3, active: true }],
  driverTargets: [{ effectiveFrom: '2026-09-01', effectiveUntil: '2026-09-30', desiredDriverProfit: 1000, active: true }]
}
const range = { from: new Date('2026-09-26T00:00:00Z'), to: new Date('2026-09-26T23:59:59Z') }
const performance = PerformanceService.getMetrics(snapshot, range)
assert.equal(performance.revenue, 2000)
assert.equal(performance.vehicleKm, 55)
assert.equal(performance.businessKm, 30)
assert.equal(performance.deadKm, 25)
assert.equal(performance.fuelCost, 1500)
assert.equal(performance.toll, 120)
assert.equal(performance.parking, 30)
assert.equal(performance.actualMaintenance, 250)
assert.ok(Number.isFinite(performance.operatingProfit))
assert.ok(Number.isFinite(performance.breakEvenRevenue))
assert.ok(Number.isFinite(performance.driverTarget))

const evidence = {
  simulation: 'FULL_CONTROLLED_PILOT',
  releaseCandidateSourceSha: sourceSha,
  shift: { id: shiftId, openingOdometer: 65000, closingOdometer: 65055 },
  trips: { completed: 2, cancelled: 1, customerPaidTotal: 2000 },
  movement: { vehicleKm: 55, businessKm: 30, deadKm: 25, gpsTracePoints: movement.gpsTracePoints, reconciliation: movement.reconciliationStatus },
  revenue: { tripFareTotal: 2000, shiftRevenue: 2000, financialRevenue: 1850, toll: 120, parking: 30 },
  fuel: { amount: 1500, pricePerKg: 100, quantityKg: 15, valid: fuelValidation.valid },
  performance: { revenue: performance.revenue, vehicleKm: performance.vehicleKm, businessKm: performance.businessKm, deadKm: performance.deadKm, operatingProfit: performance.operatingProfit },
  deviceValidation: 'DEFERRED_UNTIL_AFTER_PHASE_13'
}
console.log('KFE Phase 11 FULL SIMULATED PILOT: PASS')
console.log(JSON.stringify(evidence, null, 2))
