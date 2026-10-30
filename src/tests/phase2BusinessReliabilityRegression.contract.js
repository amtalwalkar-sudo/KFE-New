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


const createShift = repository.slice(repository.indexOf('async createShift('), repository.indexOf('async completeShift('))
assert.ok(createShift.includes("db.transaction(['shifts', 'canonical_operations', 'pending_mutations', 'audit_history'], 'readwrite')"),
  'Shift creation must commit the shift and its durable create intent in one transaction')
assert.ok(createShift.includes("shifts.getAll()"), 'Shift creation must check active shifts inside the write transaction')
assert.ok(createShift.includes("shift.status === 'ACTIVE'"), 'Shift creation must reject a second active shift')
assert.ok(createShift.includes("intents.get(intentId)") && createShift.includes('priorIntent.record'),
  'Retrying the same shift create intent must return its original record identity')
assert.ok(createShift.includes("const intent = { id: intentId, entityType: 'SHIFT', intentKey: intentKey || null, record: proposed") && createShift.includes('intents.add(intent)'),
  'Shift create intent must be durable in canonical_operations before acknowledgement')

const createTrip = repository.slice(repository.indexOf('async createTrip('), repository.indexOf('async setTripStartLocation('))
assert.ok(createTrip.includes("db.transaction(['shifts', 'trips', 'canonical_operations', 'pending_mutations', 'audit_history'], 'readwrite')"),
  'Trip creation must validate and write the trip plus its durable create intent atomically')
assert.ok(createTrip.includes('shifts.get(proposed.shiftId)'), 'Trip creation must read the canonical parent shift in its write transaction')
assert.ok(createTrip.includes('trips.getAll()'), 'Trip creation must inspect existing trips in its write transaction')
assert.ok(createTrip.includes("shift.status !== 'ACTIVE'"), 'Trip creation must reject missing or inactive parent shifts')
assert.ok(createTrip.includes("trip.shiftId === proposed.shiftId && trip.status === 'ACTIVE'"), 'Trip creation must reject a second active trip for the same shift')
assert.ok(createTrip.indexOf("trip.shiftId === proposed.shiftId && trip.status === 'ACTIVE'") < createTrip.indexOf('trips.add(proposed)'), 'Active-trip validation must happen before the trip write')
assert.ok(createTrip.indexOf("shift.status !== 'ACTIVE'") < createTrip.indexOf('trips.add(proposed)'), 'Parent-shift validation must happen before the trip write')
assert.ok(createTrip.includes("intents.get(intentId)") && createTrip.includes('priorIntent.record'),
  'Retrying the same trip create intent must return its original record identity')
assert.ok(createTrip.includes("intents.add({ id: intentId, entityType: 'TRIP', intentKey: intentKey || null, record: proposed"),
  'Trip create intent must be durable in canonical_operations before acknowledgement')

const workService = fs.readFileSync(path.join(root, 'src/application/work/workService.js'), 'utf8')
const workView = fs.readFileSync(path.join(root, 'src/views/WorkModuleView.vue'), 'utf8')
assert.ok(workService.includes('const explicitKey = data?.createIntentKey || data?.idempotencyKey'),
  'Native create retries must prefer a durable user-action key over generated record timestamps/IDs')
assert.ok(workService.includes("commitPreparedCreateIntent('SHIFT', record, data)"),
  'Android shift creation must pass through the durable SQLite create-intent journal')
assert.ok(workService.includes("commitPreparedCreateIntent('TRIP', record, tripData)"),
  'Android trip creation must pass through the durable SQLite create-intent journal')

const submitStart = workView.slice(workView.indexOf('async function submitStart()'), workView.indexOf('async function goPickup('))
assert.ok(submitStart.indexOf('await saveDraft(startDraftIdentity()') >= 0,
  'Shift create intent must be durably drafted before starting the shift')
assert.ok(submitStart.indexOf('await saveDraft(startDraftIdentity()') < submitStart.indexOf('store.startShift('),
  'Shift create intent must be saved before the canonical create request')
assert.ok(submitStart.includes('createIntentKey: startWorkflowId.value') && submitStart.includes('store.startShift('),
  'Shift retries must submit the same workflow token that was saved locally')

const goPickup = workView.slice(workView.indexOf('async function goPickup('), workView.indexOf('async function startTrip()'))
assert.ok(goPickup.indexOf('await saveDraft(identity, { createIntentKey })') >= 0,
  'Trip create intent must be durably drafted before starting pickup')
assert.ok(goPickup.indexOf('await saveDraft(identity, { createIntentKey })') < goPickup.indexOf('store.beginPickup('),
  'Trip create intent must be saved before the canonical create request')
assert.ok(goPickup.includes('store.beginPickup(operator.value || store.defaultOperator, nativeTripId || null, createIntentKey)'),
  'Trip retries must submit the same workflow token that was saved locally')

const endTrip = workView.slice(workView.indexOf('async function endTrip()'), workView.indexOf('async function saveFare('))
assert.ok(endTrip.indexOf('const tripId = store.trip.id') < endTrip.indexOf('store.endTrip()'),
  'Trip completion must capture the target trip identity before closing it')
assert.ok(endTrip.includes('fareTripId.value = tripId') && endTrip.includes("tripDraftIdentity('work-trip-details', 'ENTER_FARE', tripId)"),
  'Fare recovery must remain bound to the exact trip that was just completed')
const pendingFare = workView.slice(workView.indexOf('const pendingFare = computed('), workView.indexOf('const cockpit = computed('))
assert.ok(pendingFare.includes('t.revenue == null && t.fareDetailsSkipped !== true'),
  'Recovery must find completed trips with pending fare details without reopening explicitly skipped fares')
const saveFare = workView.slice(workView.indexOf('async function saveFare('), workView.indexOf('async function skipTripDetails('))
assert.ok(saveFare.includes('id: pendingFare.value.id') && saveFare.includes("tripDraftIdentity('work-trip-details', 'ENTER_FARE', pendingFare.value.id)"),
  'Fare submission and draft cleanup must use the same recovered trip identity')

console.log('Phase 2 business reliability regression: PASS (negative odometer rejected; active-trip shift closure blocked; trip creation atomically validates shift and trip state).')
