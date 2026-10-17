import assert from 'node:assert/strict'
import { recoverCanonicalWorkSnapshot } from '../application/work/canonicalWorkRecovery.js'

const canonicalShift = { id: 'shift-1', status: 'ACTIVE', revenue: 275, updatedAt: '2026-10-15T10:00:00.000Z' }
const canonicalCompletedTrip = { id: 'trip-1', shiftId: 'shift-1', status: 'COMPLETED', revenue: 250, updatedAt: '2026-10-15T10:00:00.000Z' }
const canonicalCancelledTrip = { id: 'trip-2', shiftId: 'shift-1', status: 'CANCELLED', cancelledRevenue: 25, updatedAt: '2026-10-15T10:00:00.000Z' }

const makeHarness = ({ shifts = [canonicalShift], trips = [canonicalCompletedTrip, canonicalCancelledTrip], localShifts, localTrips, mirrorFailure = false } = {}) => {
  let canonicalShifts = shifts.map(record => ({ ...record }))
  let canonicalTrips = trips.map(record => ({ ...record }))
  let pwaShifts = (localShifts || shifts).map(record => ({ ...record }))
  let pwaTrips = (localTrips || trips).map(record => ({ ...record }))
  let failNextMirror = mirrorFailure
  let mirrorCalls = 0
  let syncCalls = 0
  const readCanonical = async () => ({
    shifts: { records: canonicalShifts.map(record => ({ ...record })) },
    trips: { records: canonicalTrips.map(record => ({ ...record })) },
  })
  const readLocal = async () => ({ shifts: pwaShifts.map(record => ({ ...record })), trips: pwaTrips.map(record => ({ ...record })) })
  const mirrorRecord = async (entityType, record) => {
    mirrorCalls++
    if (failNextMirror) {
      failNextMirror = false
      throw new Error('simulated native write/ack interruption')
    }
    const records = entityType === 'SHIFT' ? canonicalShifts : canonicalTrips
    const index = records.findIndex(item => item.id === record.id)
    if (index >= 0) records[index] = { ...record }
    else records.push({ ...record })
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

// A native write committed but its acknowledgement was lost. Retry remains safe:
// an existing native record is never overwritten from a stale PWA snapshot.
{
  const nativeShift = { ...canonicalShift, revenue: 275 }
  const staleLocal = { ...canonicalShift, revenue: 0, updatedAt: '2026-10-15T12:00:00.000Z' }
  const h = makeHarness({ shifts: [nativeShift], localShifts: [staleLocal] })
  await recoverCanonicalWorkSnapshot(h)
  assert.equal(h.getCanonicalShifts()[0].revenue, 275)
  assert.equal(h.getPwaShifts()[0].revenue, 275)
  assert.equal(h.getMirrorCalls(), 0)
}

console.log('PASS: native canonical records win over stale PWA snapshots; local-only interrupted mirrors remain recoverable')
