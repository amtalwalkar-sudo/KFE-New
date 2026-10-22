import assert from 'node:assert/strict'
import { isAcceptedNativeTripFormOperation } from '../application/work/nativeTripFormRecovery.js'

const nativeFare = {
  found: true, status: 'ACCEPTED', entityType: 'TRIP', entityId: 'trip-1',
  command: 'SUBMIT_TRIP_FORM',
  outcome: { mode: 'FARE', tripId: 'trip-1', trip: { id: 'trip-1', status: 'COMPLETED' } }
}
assert.equal(isAcceptedNativeTripFormOperation(nativeFare, 'FARE', 'trip-1'), true)
assert.equal(isAcceptedNativeTripFormOperation({ ...nativeFare, outcome: { ...nativeFare.outcome, mode: 'CANCEL' } }, 'FARE', 'trip-1'), false)
assert.equal(isAcceptedNativeTripFormOperation({ ...nativeFare, status: 'REJECTED' }, 'FARE', 'trip-1'), false)
assert.equal(isAcceptedNativeTripFormOperation({ ...nativeFare, entityId: 'trip-2' }, 'FARE', 'trip-1'), false)
assert.equal(isAcceptedNativeTripFormOperation({ ...nativeFare, found: false }, 'FARE', 'trip-1'), false)
assert.equal(isAcceptedNativeTripFormOperation({ ...nativeFare, command: 'OTHER' }, 'FARE', 'trip-1'), false)

const pwaCancellation = {
  found: true, status: 'ACCEPTED', entityType: 'TRIP', entityId: 'trip-2',
  command: 'PUT_RECORD',
  outcome: { record: { id: 'trip-2', status: 'CANCELLED' } }
}
assert.equal(isAcceptedNativeTripFormOperation(pwaCancellation, 'CANCEL', 'trip-2'), true)
assert.equal(isAcceptedNativeTripFormOperation({ ...pwaCancellation, outcome: { record: { id: 'trip-2', status: 'ACTIVE' } } }, 'CANCEL', 'trip-2'), false)
assert.equal(isAcceptedNativeTripFormOperation(pwaCancellation, 'FARE', 'trip-2'), false)

console.log('Native trip-form replay contract: only an accepted, matching durable form operation proves a fare/cancellation commit.')
