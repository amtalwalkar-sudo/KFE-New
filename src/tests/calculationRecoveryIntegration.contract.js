import assert from 'node:assert/strict'
import { OperationalRecordService } from '../application/timeline/operationalRecordService.js'
import { ShiftTripRepository } from '../repositories/shiftTripRepository.js'
import { FuelRepository } from '../repositories/fuelRepository.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'

// Exercise the real read-model service against a controlled canonical-record fixture,
// then feed the same persisted movement authority into the calculation engine.
const originalShifts = ShiftTripRepository.getAllShifts
const originalTrips = ShiftTripRepository.getTripsForShift
const originalFuel = FuelRepository.getAll
const shift = {
  id: 'integration-shift', status: 'COMPLETED', startOdometer: 100, endOdometer: 200,
  shiftStartAt: '2026-10-13T08:00:00+05:30', shiftEndAt: '2026-10-13T18:00:00+05:30',
  revenue: 1000, toll: 0, parking: 0, tollParkingCaptureMode: 'ADDITIONAL_ONLY',
  movementReconciliation: { reconciliationStatus: 'RECONCILED', segments: [
    { classification: 'BUSINESS', distanceKm: 40 },
    { classification: 'DEAD', distanceKm: 30 },
    { classification: 'CANCELLED', distanceKm: 10 },
    { classification: 'UNCLASSIFIED', distanceKm: 20 }
  ] }
}
try {
  ShiftTripRepository.getAllShifts = async () => [shift]
  ShiftTripRepository.getTripsForShift = async () => [
    { id: 'completed', shiftId: shift.id, status: 'COMPLETED', tripKm: 40, revenue: 1000, tripStartAt: '2026-10-13T09:00:00+05:30', tripEndAt: '2026-10-13T10:00:00+05:30', toll: 0, parking: 0 },
    { id: 'cancelled', shiftId: shift.id, status: 'CANCELLED', tripKm: 10, tripStartAt: '2026-10-13T11:00:00+05:30', tripEndAt: '2026-10-13T11:10:00+05:30', toll: 0, parking: 0 }
  ]
  FuelRepository.getAll = async () => [{ id: 'fuel-1', odometer: 150, amount: 300, quantityKg: 4 }]
  const operational = await OperationalRecordService.reconstructShift(shift.id)
  assert.equal(operational.vehicleKm, 100)
  assert.equal(operational.businessKm, 40)
  assert.equal(operational.deadKm, 30)
  assert.equal(operational.cancelledKm, 10)
  assert.equal(operational.unclassifiedKm, 20)
  assert.equal(operational.movementReconciliationStatus, 'RECONCILED')
  assert.equal(operational.fuelCost, 300)
  const range = { from: new Date('2026-10-13T00:00:00+05:30'), to: new Date('2026-10-13T23:59:59+05:30') }
  const metrics = derivePerformance({
    shifts: [shift],
    trips: [
      { id: 'completed', shiftId: shift.id, status: 'COMPLETED', tripKm: 40, revenue: 1000, tripEndAt: '2026-10-13T10:00:00+05:30' },
      { id: 'cancelled', shiftId: shift.id, status: 'CANCELLED', tripKm: 10, cancelledRevenue: 0, tripEndAt: '2026-10-13T11:10:00+05:30' }
    ],
    fuelLogs: [{ id: 'fuel-1', odometer: 150, amount: 300, quantityKg: 4 }],
    maintenance: [], compliance: [], vehicles: [], settlements: [], breakEvenInputs: []
  }, range)
  assert.equal(metrics.businessKm, operational.businessKm)
  assert.equal(metrics.deadKm, operational.deadKm)
  assert.equal(metrics.cancelledKm, operational.cancelledKm)
  assert.equal(metrics.unclassifiedKm, operational.unclassifiedKm)

  // Legacy/unavailable reconciliation must not fabricate DEAD KM from the remainder.
  ShiftTripRepository.getAllShifts = async () => [{ ...shift, movementReconciliation: { reconciliationStatus: 'UNAVAILABLE', segments: [] } }]
  const legacy = await OperationalRecordService.reconstructShift(shift.id)
  assert.equal(legacy.deadKm, null)
  assert.equal(legacy.unclassifiedKm, 50)
  assert.equal(legacy.unavailable.movementReconciliation, true)
  console.log('Calculation/recovery read-model integration: PASS')
} finally {
  ShiftTripRepository.getAllShifts = originalShifts
  ShiftTripRepository.getTripsForShift = originalTrips
  FuelRepository.getAll = originalFuel
}
