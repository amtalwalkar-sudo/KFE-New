import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createCanonicalShiftRecord, createCanonicalTripRecord } from '../domain/work/canonicalWorkRecords.js'

const fixedNow = '2026-10-25T12:00:00.000Z'
const ids = []
const createId = () => { const id = `generated-${ids.length + 1}`; ids.push(id); return id }

const shift = createCanonicalShiftRecord({
  startOdometer: '12500',
  openingPersonalKm: '2',
  openingDeadKm: 3,
  businessStartDate: '2026-10-01',
}, { createId, now: fixedNow })
assert.equal(shift.id, 'generated-1')
assert.equal(shift.startOdometer, 12500)
assert.equal(shift.openingPersonalKm, 2)
assert.equal(shift.openingDeadKm, 3)
assert.equal(shift.status, 'ACTIVE')
assert.equal(shift.shiftStartAt, fixedNow)
assert.equal(shift.createdAt, fixedNow)
assert.equal(shift.updatedAt, fixedNow)
assert.equal(shift.tollParkingCaptureMode, 'ADDITIONAL_ONLY')

const suppliedShift = createCanonicalShiftRecord({
  id: 'existing-shift-id',
  startOdometer: 20,
}, { createId, now: fixedNow })
assert.equal(suppliedShift.id, 'existing-shift-id')
assert.equal(ids.length, 1, 'a supplied canonical identity must not be regenerated')

const trip = createCanonicalTripRecord({
  shiftId: 'generated-1',
  operator: 'DRIVER',
  tripStage: 'GOING_TO_PICKUP',
  tripKm: 4.5,
}, { createId, now: fixedNow })
assert.equal(trip.id, 'generated-2')
assert.equal(trip.shiftId, 'generated-1')
assert.equal(trip.status, 'ACTIVE')
assert.equal(trip.tripStage, 'GOING_TO_PICKUP')
assert.equal(trip.tripKm, 4.5)
assert.equal(trip.tripKmAuthority, 'MANUAL')
assert.equal(trip.revenueAuthority, 'SUPPORTING_ONLY')
assert.equal(trip.tripStartLocationStatus, 'MISSING')
assert.equal(trip.tripEndLocationStatus, 'MISSING')
assert.equal(trip.createdAt, fixedNow)
assert.equal(trip.updatedAt, fixedNow)

assert.throws(() => createCanonicalTripRecord({}, { createId, now: fixedNow }), /shiftId is required/)
assert.throws(() => createCanonicalShiftRecord({ startOdometer: 'not-a-number' }, { createId, now: fixedNow }), /startOdometer must be a finite number/)

const root = new URL('..', import.meta.url)
const workService = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
const repository = fs.readFileSync(new URL('../repositories/shiftTripRepository.js', import.meta.url), 'utf8')
assert.match(workService, /createCanonicalShiftRecord/)
assert.match(workService, /createCanonicalTripRecord/)
assert.match(repository, /createCanonicalShiftRecord\(data, \{ createId: generateUUID, now \}\)/)
assert.match(repository, /createCanonicalTripRecord\(data, \{ createId: generateUUID, now \}\)/)
assert.ok(root, 'module root resolves')

console.log('Canonical Work record factory contract: browser and native create paths share one Shift/Trip record shape.')
