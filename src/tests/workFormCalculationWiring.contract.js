import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { validateFuelEntry } from '../domain/work/fuel.js'
import { validateTripCorrection } from '../domain/work/trip.js'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { MovementAccountingService } from '../domain/movement/movementAccounting.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'

const root = process.cwd()
const source = relative => fs.readFileSync(path.join(root, relative), 'utf8')

// Long shift confirmation must be both required by the domain and representable in the Work form.
const unconfirmedLongShift = validateEndShiftEntry({ closingOdometer: 700, startOdometer: 100 })
assert.equal(unconfirmedLongShift.valid, false)
assert.equal(unconfirmedLongShift.requiresConfirmation, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 700, startOdometer: 100, confirmLargeDistance: true }).valid, true)
const workView = source('src/views/WorkModuleView.vue')
const contextForm = source('src/components/work/WorkContextForm.vue')
const endForm = source('src/components/work/WorkEndShiftForm.vue')
assert.match(workView, /confirmLargeDistance: largeDistanceKm\.value > 500 && largeDistanceConfirmation\.value === largeDistanceIdentity\.value/)
assert.doesNotMatch(workView, /shiftRevenue|reviewRevenue|continueReconcile|reviewDone/, 'End Shift must not ask for or process shift revenue/review inputs.')
assert.doesNotMatch(endForm, /RECONCILE|REVIEW|shiftRevenue|endMissing|endPreview/, 'End Shift form must not contain revenue/date reconciliation stages.')
assert.match(workView, /:end-large-distance-km="largeDistanceKm"/)
assert.match(contextForm, /@update:large-distance-confirmed-for/)
assert.match(endForm, /endLargeDistanceKm > 500 && largeDistanceConfirmedFor !== largeDistanceIdentity/)

// Fuel entries are validated, linked to the primary vehicle before create, and refreshed after commit.
const validFuel = validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 410, isFullTank: false })
assert.equal(validFuel.valid, true)
assert.equal(validFuel.quantityKg, 5)
assert.equal(validFuel.isFullTank, false)
const fuelService = source('src/application/work/fuel.js')
const fuelView = source('src/views/WorkModuleView.vue')
assert.match(fuelService, /await ShiftTripRepository\.getPrimaryVehicleId\(\)/)
assert.match(fuelService, /FuelRepository\.create\(\{ \.\.\.validation, vehicleId/)
assert.doesNotMatch(fuelService, /captureWorkLocation|Promise\.race|setTimeout/)
assert.doesNotMatch(fuelService, /void ShiftTripRepository\.getPrimaryVehicleId/)
assert.match(fuelView, /await fuel\.refresh\(\)/)
const fuelRepo = source('src/repositories/fuelRepository.js')
assert.match(fuelRepo, /db\.transaction\(stores, 'readwrite'\)/)
assert.match(fuelRepo, /writeMutationAndAudit\(mutationStore, auditStore, \{ entityId: fuelRecord\.id, entityType: 'FUEL', action: 'CREATE'/)

// Clearing a saved fare must persist null and leave reconciliation explicitly unpriced, not stale.
const clearedFare = validateTripCorrection({ id: 'trip-1', revenue: '' })
assert.equal(clearedFare.valid, true)
assert.equal(clearedFare.revenue, null)
const fareReconciliation = reconcileShiftRevenue({ shiftRevenue: 500, trips: [{ id: 'trip-1', status: 'COMPLETED', revenue: clearedFare.revenue }] })
assert.equal(fareReconciliation.reconciliationStatus, 'UNAVAILABLE')
assert.equal(fareReconciliation.unpricedTrips, 1)
const shiftRepo = source('src/repositories/shiftTripRepository.js')
assert.match(shiftRepo, /db\.transaction\(\['shifts', 'trips', 'pending_mutations', 'audit_history'\], 'readwrite'\)/)
assert.match(shiftRepo.slice(shiftRepo.indexOf('async completeShift(data)'), shiftRepo.indexOf('async createTrip(data)')), /applyShiftRevenueProjection\(shift, shiftTrips\)/, 'Shift completion must atomically rederive revenue from canonical linked trips')
assert.doesNotMatch(shiftRepo.slice(shiftRepo.indexOf('async completeShift(data)'), shiftRepo.indexOf('async createTrip(data)')), /data\.revenue/, 'Shift completion must not accept a competing manual revenue total')

// Odometer remainder with no trustworthy segment evidence must stay UNCLASSIFIED, not be silently called dead KM.
const movement = await MovementAccountingService.reconcileShiftMovement({ trips: [], startOdometer: 100, endOdometer: 200 })
assert.equal(movement.reconciliationStatus, 'RECONCILED')
assert.equal(movement.deadMilesKm, 0)
assert.equal(movement.businessMilesKm, 0)
assert.equal(movement.cancelledMilesKm, 0)
assert.equal(movement.unclassifiedKm, 100)
assert.equal(movement.segments.find(segment => segment.id === 'SHIFT_RECONCILIATION_REMAINDER')?.classification, 'UNCLASSIFIED')

// Performance consumes the persisted segment classifications, including cancellation and unclassified KM.
const shift = {
  id: 'shift-1', status: 'COMPLETED', startOdometer: 100, endOdometer: 200,
  shiftStartAt: '2026-10-13T08:00:00+05:30', shiftEndAt: '2026-10-13T18:00:00+05:30',
  revenue: 1000, toll: 0, parking: 0, movementReconciliation: {
    reconciliationStatus: 'RECONCILED',
    segments: [
      { classification: 'BUSINESS', distanceKm: 40 },
      { classification: 'DEAD', distanceKm: 30 },
      { classification: 'CANCELLED', distanceKm: 10 },
      { classification: 'UNCLASSIFIED', distanceKm: 20 }
    ]
  }
}
const range = { from: new Date('2026-10-13T00:00:00+05:30'), to: new Date('2026-10-13T23:59:59+05:30') }
const metrics = derivePerformance({
  shifts: [shift],
  trips: [
    { id: 'completed-1', shiftId: 'shift-1', status: 'COMPLETED', tripKm: 40, revenue: 1000, tripEndAt: '2026-10-13T12:00:00+05:30' },
    { id: 'cancelled-1', shiftId: 'shift-1', status: 'CANCELLED', tripKm: 10, cancelledRevenue: 0, tripEndAt: '2026-10-13T14:00:00+05:30' }
  ],
  fuelLogs: [], maintenance: [], compliance: [], vehicles: [], settlements: [], breakEvenInputs: []
}, range)
assert.equal(metrics.vehicleKm, 100)
assert.equal(metrics.businessKm, 40)
assert.equal(metrics.deadKm, 30)
assert.equal(metrics.cancelledKm, 10)
assert.equal(metrics.unclassifiedKm, 20)

console.log('Work form calculation wiring contract: PASS — end-shift confirmation, vehicle-linked fuel refresh, atomic fare reconciliation, and shared movement classifications.')
