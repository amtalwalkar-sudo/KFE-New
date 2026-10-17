import assert from 'node:assert/strict'
import { recoverCanonicalWorkSnapshot } from '../application/work/canonicalWorkRecovery.js'

const canonicalShift = { id: 'shift-1', status: 'ACTIVE', revenue: 275, updatedAt: '2026-10-15T10:00:00.000Z' }
const canonicalCompletedTrip = { id: 'trip-1', shiftId: 'shift-1', status: 'COMPLETED', revenue: 250, updatedAt: '2026-10-15T10:00:00.000Z' }
const canonicalCancelledTrip = { id: 'trip-2', shiftId: 'shift-1', status: 'CANCELLED', cancelledRevenue: 25, updatedAt: '2026-10-15T10:00:00.000Z' }

const makeHarness = ({ shifts = [canonicalShift], trips = [canonicalCompletedTrip, canonicalCancelledTrip], localShifts, localTrips, mirrorFailure = false, loseAckAfterCommit = false } = {}) => {
  let canonicalShifts = shifts.map(record => ({ ...record }))
  let canonicalTrips = trips.map(record => ({ ...record }))
  let pwaShifts = (localShifts || shifts).map(record => ({ ...record }))
  let pwaTrips = (localTrips || trips).map(record => ({ ...record }))
  let failNextMirror = mirrorFailure
  let loseNextAckAfterCommit = loseAckAfterCommit
  const seenOperations = new Set()
  let mirrorCalls = 0
  let syncCalls = 0
  const readCanonical = async () => ({
    shifts: { records: canonicalShifts.map(record => ({ ...record })) },
    trips: { records: canonicalTrips.map(record => ({ ...record })) },
  })
  const readLocal = async () => ({ shifts: pwaShifts.map(record => ({ ...record })), trips: pwaTrips.map(record => ({ ...record })) })
  const mirrorRecord = async (entityType, record) => {
    mirrorCalls++
    const operationId = record?._nativeCanonicalSync?.operationId
    if (operationId && seenOperations.has(operationId)) return
    if (failNextMirror) {
      failNextMirror = false
      throw new Error('simulated native write/ack interruption')
    }
    const canonicalRecord = { ...record }
    delete canonicalRecord._nativeCanonicalSync
    const records = entityType === 'SHIFT' ? canonicalShifts : canonicalTrips
    const index = records.findIndex(item => item.id === record.id)
    if (index >= 0) records[index] = canonicalRecord
    else records.push(canonicalRecord)
    if (operationId) seenOperations.add(operationId)
    if (operationId && loseNextAckAfterCommit) {
      loseNextAckAfterCommit = false
      throw new Error('simulated lost acknowledgement after native commit')
    }
  }
  const syncCanonicalRecords = async ({ shifts: freshShifts, trips: freshTrips }) => {
    syncCalls++
    // Model the required Android recovery contract: canonical snapshots replace
    // PWA cache records even if a stale cache happens to have a later timestamp.
    pwaShifts = freshShifts.map(record => ({ ...record }))
    pwaTrips = freshTrips.map(record => ({ ...record }))
  }
  return {
    readCanonical, readLocal, mirrorRecord, syncCanonicalRecords,
    getCanonicalShifts: () => canonicalShifts,
    getPwaShifts: () => pwaShifts,
    getPwaTrips: () => pwaTrips,
    getMirrorCalls: () => mirrorCalls,
    getSyncCalls: () => syncCalls,
  }
}

// A stale PWA snapshot with a later timestamp must not overwrite native trip
// completion or reset the native revenue projection to zero.
{
  const staleShift = { ...canonicalShift, revenue: 0, updatedAt: '2026-10-15T10:30:00.000Z' }
  const staleActiveTrip = { ...canonicalCompletedTrip, status: 'ACTIVE', revenue: null, updatedAt: '2026-10-15T10:30:00.000Z' }
  const h = makeHarness({ localShifts: [staleShift], localTrips: [staleActiveTrip, canonicalCancelledTrip] })
  const result = await recoverCanonicalWorkSnapshot(h)
  assert.equal(h.getMirrorCalls(), 0, 'existing local records must never be promoted based on updatedAt')
  assert.equal(h.getCanonicalShifts()[0].revenue, 275, 'canonical revenue must remain unchanged')
  assert.equal(result.trips.records.find(record => record.id === 'trip-1').status, 'COMPLETED')
  assert.equal(h.getPwaShifts()[0].revenue, 275, 'PWA cache must converge to canonical revenue')
  assert.equal(h.getPwaTrips().find(record => record.id === 'trip-1').status, 'COMPLETED', 'PWA cache must converge to canonical lifecycle state')
}

// Equal timestamps with conflicting values are still resolved by native authority;
// timestamps are not an identity/version token across independent writers.
{
  const conflict = { ...canonicalCancelledTrip, status: 'ACTIVE', cancelledRevenue: null }
  const h = makeHarness({ localTrips: [canonicalCompletedTrip, conflict] })
  await recoverCanonicalWorkSnapshot(h)
  assert.equal(h.getPwaTrips().find(record => record.id === 'trip-2').status, 'CANCELLED')
  assert.equal(h.getPwaTrips().find(record => record.id === 'trip-2').cancelledRevenue, 25)
  assert.equal(h.getMirrorCalls(), 0)
}

// A local-only record may represent an interrupted first mirror. It is promoted,
// but recovery must stop if the native write/ack fails and must not sync a snapshot.
{
  const localOnly = { id: 'shift-local-only', status: 'ACTIVE', revenue: 0, updatedAt: '2026-10-15T11:00:00.000Z' }
  const h = makeHarness({ localShifts: [canonicalShift, localOnly], mirrorFailure: true })
  await assert.rejects(recoverCanonicalWorkSnapshot(h), /simulated native write\/ack interruption/)
  assert.equal(h.getSyncCalls(), 0, 'failed first mirror must block PWA snapshot synchronization')
  assert.equal(h.getCanonicalShifts().some(record => record.id === localOnly.id), false)
  await recoverCanonicalWorkSnapshot(h)
  assert.equal(h.getCanonicalShifts().some(record => record.id === localOnly.id), true, 'retry should promote a local-only record')
  assert.equal(h.getSyncCalls(), 1)
}


// An explicit durable pending-operation marker preserves a legitimate local
// mutation, and a lost post-commit acknowledgement retries with the same ID.
{
  const pendingShift = {
    ...canonicalShift,
    revenue: 300,
    updatedAt: '2026-10-15T10:30:00.000Z',
    _nativeCanonicalSync: { operationId: 'op-shift-300', fingerprint: 'stable-payload-fingerprint' },
  }
  const h = makeHarness({ localShifts: [pendingShift], loseAckAfterCommit: true })
  await assert.rejects(recoverCanonicalWorkSnapshot(h), /lost acknowledgement after native commit/)
  assert.equal(h.getCanonicalShifts()[0].revenue, 300, 'native commit may succeed before the bridge acknowledgement is lost')
  assert.equal(h.getSyncCalls(), 0, 'do not sync PWA before pending operation acknowledgement is recovered')
  const recovered = await recoverCanonicalWorkSnapshot(h)
  assert.equal(recovered.shifts.records[0].revenue, 300)
  assert.equal(h.getPwaShifts()[0].revenue, 300)
  assert.equal(h.getMirrorCalls(), 2, 'retry must use the same idempotent operation rather than lose the pending write')
  assert.equal(h.getSyncCalls(), 1)
}

// A stale PWA snapshot without a pending marker must never replay an old write
// after native state has advanced.
{
  const nativeShift = { ...canonicalShift, revenue: 275 }
  const staleLocal = { ...canonicalShift, revenue: 0, updatedAt: '2026-10-15T12:00:00.000Z' }
  const h = makeHarness({ shifts: [nativeShift], localShifts: [staleLocal] })
  await recoverCanonicalWorkSnapshot(h)
  assert.equal(h.getCanonicalShifts()[0].revenue, 275)
  assert.equal(h.getPwaShifts()[0].revenue, 275)
  assert.equal(h.getMirrorCalls(), 0)
}

console.log('PASS: stale PWA snapshots are rejected; journaled pending mirrors survive interrupted writes and lost acknowledgements')
