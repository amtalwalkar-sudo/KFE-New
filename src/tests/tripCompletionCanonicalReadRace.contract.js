import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const repository = read('../repositories/shiftTripRepository.js')
const service = read('../application/work/workService.js')
const store = read('../stores/shiftTrip.js')

const mirrorStart = service.indexOf('const mirrorCanonicalTripById = async id => {')
const mirrorEnd = service.indexOf('// Native putRecord now updates the shift', mirrorStart)
assert.ok(mirrorStart >= 0 && mirrorEnd > mirrorStart, 'trip mirror helper must remain an explicit, testable boundary')
const mirror = service.slice(mirrorStart, mirrorEnd)

assert.ok(
  repository.includes('async getAllTrips({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary();'),
  'trip repository must allow a local read that skips canonical reconciliation'
)
assert.ok(
  mirror.includes('ShiftTripRepository.getAllTrips({ skipCanonicalReadBoundary: true })'),
  'trip mirroring must read the just-completed local record without reconciling stale native ACTIVE state first'
)
assert.ok(
  !/ShiftTripRepository\.getAllTrips\(\)/.test(mirror),
  'trip mirroring must not perform a default canonical read before sending the completed record to native storage'
)

const endTripStart = store.indexOf('const endTrip = async () => {')
const cancelTripStart = store.indexOf('const cancelTrip = async', endTripStart)
assert.ok(endTripStart >= 0 && cancelTripStart > endTripStart, 'store endTrip implementation must remain identifiable')
const endTrip = store.slice(endTripStart, cancelTripStart)
assert.ok(endTrip.indexOf('await WorkService.completeTrip({ id: tripId })') < endTrip.indexOf("status: 'COMPLETED'"), 'the PWA must persist trip completion before projecting it into the UI')
assert.ok(endTrip.indexOf("completedTrips.value = [...completedTrips.value.filter(item => item.id !== tripId), completed]") < endTrip.indexOf('void refresh().catch(() => {})'), 'the completed trip must enter the fare-form source list before background refresh begins')

console.log('PASS: trip completion mirrors the local COMPLETED record before any canonical read can restore stale ACTIVE state')
