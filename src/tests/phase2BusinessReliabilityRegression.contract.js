import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanonicalShiftRecord } from '../domain/work/canonicalWorkRecords.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repository = fs.readFileSync(path.join(root, 'src/repositories/shiftTripRepository.js'), 'utf8')
const completeShift = repository.slice(repository.indexOf('async completeShift('), repository.indexOf('async createTrip('))

const valid = createCanonicalShiftRecord({ startOdometer: 100 }, { createId: () => 'shift-test', now: '2026-10-25T10:00:00.000Z' })
assert.equal(valid.startOdometer, 100)
assert.throws(
  () => createCanonicalShiftRecord({ startOdometer: -1 }, { createId: () => 'shift-test' }),
  /startOdometer cannot be negative/,
  'Canonical shift creation must reject a negative starting odometer'
)

const activeTripGuard = completeShift.indexOf("shiftTrips.some(trip => trip.status === 'ACTIVE')")
const revenueProjection = completeShift.indexOf('shift.revenue = deriveLiveRevenue(shiftTrips)')
const shiftWrite = completeShift.indexOf('shifts.put(writeRecord)')
assert.ok(activeTripGuard >= 0, 'Shift completion must reject a shift that still has an active trip')
assert.ok(revenueProjection > activeTripGuard, 'Active-trip validation must happen before revenue projection')
assert.ok(shiftWrite > activeTripGuard, 'Active-trip validation must happen before the shift write')
assert.ok(completeShift.includes('Cannot complete a shift while a trip is active.'), 'Rejection must explain the recovery action')


const createTrip = repository.slice(repository.indexOf('async createTrip('), repository.indexOf('async setTripStartLocation('))
assert.ok(createTrip.includes("db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite')"),
  'Trip creation must validate and write inside one transaction covering shifts and trips')
assert.ok(createTrip.includes('shifts.get(record.shiftId)'), 'Trip creation must read the canonical parent shift in its write transaction')
assert.ok(createTrip.includes('trips.getAll()'), 'Trip creation must inspect existing trips in its write transaction')
assert.ok(createTrip.includes("shift.status !== 'ACTIVE'"), 'Trip creation must reject missing or inactive parent shifts')
assert.ok(createTrip.includes("trip.shiftId === record.shiftId && trip.status === 'ACTIVE'"), 'Trip creation must reject a second active trip for the same shift')
assert.ok(createTrip.indexOf('hasActiveTrip') < createTrip.indexOf('trips.put(record)'), 'Active-trip validation must happen before the trip write')
assert.ok(createTrip.indexOf('shift.status !==') < createTrip.indexOf('trips.put(record)'), 'Parent-shift validation must happen before the trip write')

console.log('Phase 2 business reliability regression: PASS (negative odometer rejected; active-trip shift closure blocked; trip creation atomically validates shift and trip state).')
