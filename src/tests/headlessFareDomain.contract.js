import assert from 'node:assert/strict'
import { evaluateHeadlessFareCommand } from '../application/work/headlessFareCommand.poc.js'

const completedTrip = {
  id: 'trip-poc-1',
  shiftId: 'shift-poc-1',
  status: 'COMPLETED',
  revenue: null,
  fareDetailsSkipped: false,
}
const command = {
  type: 'FARE_SUBMITTED',
  operationId: 'fare-poc-operation-1',
  tripId: completedTrip.id,
  fare: 450,
  fareDetailsSkipped: false,
  at: '2026-10-20T10:00:00.000Z',
}
const result = evaluateHeadlessFareCommand({
  command,
  trip: completedTrip,
  shiftTrips: [completedTrip],
})
assert.equal(result.ok, true)
assert.equal(result.trip.id, completedTrip.id)
assert.equal(result.trip.revenue, 450)
assert.equal(result.shiftRevenue, 450)
assert.equal(completedTrip.revenue, null, 'the evaluator must not mutate its input')

const skipped = evaluateHeadlessFareCommand({
  command: { ...command, operationId: 'fare-poc-skipped', fare: null, fareDetailsSkipped: true },
  trip: completedTrip,
  shiftTrips: [completedTrip],
})
assert.equal(skipped.ok, true)
assert.equal(skipped.shiftRevenue, 0, 'skipped fare detail contributes ₹0')

const badFare = evaluateHeadlessFareCommand({
  command: { ...command, operationId: 'fare-poc-invalid', fare: -1 },
  trip: completedTrip,
  shiftTrips: [completedTrip],
})
assert.equal(badFare.ok, false, 'negative fares must be rejected')

const activeTrip = evaluateHeadlessFareCommand({
  command,
  trip: { ...completedTrip, status: 'ACTIVE' },
  shiftTrips: [{ ...completedTrip, status: 'ACTIVE' }],
})
assert.equal(activeTrip.ok, false, 'fare command must not complete an active trip implicitly')

const missingOperationId = evaluateHeadlessFareCommand({
  command: { ...command, operationId: '' },
  trip: completedTrip,
  shiftTrips: [completedTrip],
})
assert.equal(missingOperationId.ok, false)

console.log('Headless fare domain POC contract passed (pure domain only; no SQLite/runtime claim).')
