import assert from 'node:assert/strict'
import { recoverCanonicalWorkSnapshot } from '../application/work/canonicalWorkRecovery.js'

const oldRecord = { id: 'shift-1', status: 'ACTIVE', revenue: 250, updatedAt: '2026-10-15T10:00:00.000Z' }
const newerRecord = { id: 'shift-1', status: 'COMPLETED', revenue: 400, updatedAt: '2026-10-15T10:01:00.000Z' }
const trip = { id: 'trip-1', shiftId: 'shift-1', status: 'COMPLETED', revenue: 400, updatedAt: '2026-10-15T10:01:00.000Z' }

const makeHarness = ({ failFirstMirror = true } = {}) => {
  let canonicalShifts = [oldRecord]
  let canonicalTrips = [trip]
  let localShifts = [newerRecord]
  let localTrips = [trip]
  let failNextMirror = failFirstMirror
  let syncCalls = 0
  const readCanonical = async () => ({
    shifts: { records: canonicalShifts.map(record => ({ ...record })) },
    trips: { records: canonicalTrips.map(record => ({ ...record })) },
  })
  const readLocal = async () => ({ shifts: localShifts.map(record => ({ ...record })), trips: localTrips.map(record => ({ ...record })) })
  const mirrorRecord = async (entityType, record) => {
    if (failNextMirror) {
      failNextMirror = false
      throw new Error('simulated native write/ack interruption')
    }
    const records = entityType === 'SHIFT' ? canonicalShifts : canonicalTrips
    const index = records.findIndex(item => item.id === record.id)
    if (index >= 0 && Date.parse(records[index].updatedAt) > Date.parse(record.updatedAt)) {
      throw new Error('stale canonical write rejected')
    }
    if (index >= 0) records[index] = { ...record }
    else records.push({ ...record })
  }
  const syncCanonicalRecords = async ({ shifts, trips }) => {
    syncCalls++
    localShifts = shifts.map(record => ({ ...record }))
    localTrips = trips.map(record => ({ ...record }))
  }
  return { readCanonical, readLocal, mirrorRecord, syncCanonicalRecords, getSyncCalls: () => syncCalls, getCanonicalShifts: () => canonicalShifts }
}

{
  const h = makeHarness()
  await assert.rejects(recoverCanonicalWorkSnapshot(h), /simulated native write\/ack interruption/)
  assert.equal(h.getSyncCalls(), 0, 'failed or interrupted mirror must block snapshot sync')
  assert.equal(h.getCanonicalShifts()[0].status, 'ACTIVE', 'failed mirror must not falsely acknowledge the newer record')
  const result = await recoverCanonicalWorkSnapshot(h)
  assert.equal(result.shifts.records[0].status, 'COMPLETED', 'retry must promote the newer local record after native acknowledgement')
  assert.equal(h.getSyncCalls(), 1, 'successful retry must sync only after canonical re-read')
}

{
  const h = makeHarness({ failFirstMirror: false })
  // Simulate a stale snapshot arriving after a newer local write. The recovery
  // flow must promote the local record before asking IndexedDB to sync the snapshot.
  const result = await recoverCanonicalWorkSnapshot(h)
  assert.equal(result.shifts.records[0].updatedAt, newerRecord.updatedAt)
  assert.equal(h.getCanonicalShifts()[0].revenue, 400)
}

{
  const h = makeHarness()
  const equalVersionConflict = { ...newerRecord, status: 'ACTIVE' }
  const originalReadLocal = h.readLocal
  const originalReadCanonical = h.readCanonical
  h.readCanonical = async () => {
    const snapshot = await originalReadCanonical()
    snapshot.shifts.records = [{ ...newerRecord }]
    return snapshot
  }
  h.readLocal = async () => {
    const local = await originalReadLocal()
    local.shifts = [equalVersionConflict]
    return local
  }
  await assert.rejects(recoverCanonicalWorkSnapshot(h), /different records share updatedAt/)
  assert.equal(h.getSyncCalls(), 0, 'equal-version conflict must not be silently overwritten')
}

{
  // Native SQLite commits the write, but the bridge response is lost. The first
  // reconciliation must not sync a snapshot until the retry/re-read establishes
  // the durable canonical result.
  let canonicalShifts = [oldRecord]
  let canonicalTrips = [trip]
  let localShifts = [newerRecord]
  let localTrips = [trip]
  let loseAcknowledgementAfterCommit = true
  let syncCalls = 0
  const harness = {
    readCanonical: async () => ({
      shifts: { records: canonicalShifts.map(record => ({ ...record })) },
      trips: { records: canonicalTrips.map(record => ({ ...record })) },
    }),
    readLocal: async () => ({ shifts: localShifts.map(record => ({ ...record })), trips: localTrips.map(record => ({ ...record })) }),
    mirrorRecord: async (entityType, record) => {
      const records = entityType === 'SHIFT' ? canonicalShifts : canonicalTrips
      const index = records.findIndex(item => item.id === record.id)
      if (index >= 0) records[index] = { ...record }
      else records.push({ ...record })
      if (loseAcknowledgementAfterCommit) {
        loseAcknowledgementAfterCommit = false
        throw new Error('simulated lost acknowledgement after native commit')
      }
    },
    syncCanonicalRecords: async ({ shifts, trips }) => {
      syncCalls++
      localShifts = shifts.map(record => ({ ...record }))
      localTrips = trips.map(record => ({ ...record }))
    },
  }
  await assert.rejects(recoverCanonicalWorkSnapshot(harness), /lost acknowledgement after native commit/)
  assert.equal(canonicalShifts[0].revenue, 400, 'the native write may have committed despite a lost response')
  assert.equal(syncCalls, 0, 'no snapshot may be copied back while the write outcome is ambiguous')
  const recovered = await recoverCanonicalWorkSnapshot(harness)
  assert.equal(recovered.shifts.records[0].revenue, 400, 'retry must converge to the committed canonical value')
  assert.equal(syncCalls, 1, 'recovery must sync only after re-reading canonical state')
}

console.log('PASS: canonical recovery retries interrupted mirrors, handles lost acknowledgements after commit, and rejects stale/equal-version conflicts')
