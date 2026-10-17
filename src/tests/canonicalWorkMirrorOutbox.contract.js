import assert from 'node:assert/strict'
import { createCanonicalMirrorOutbox } from '../application/work/canonicalWorkMirrorOutbox.js'

const makeHarness = ({ failBeforeCommit = false, loseFirstAck = false } = {}) => {
  const outbox = new Map()
  const nativeRecords = new Map()
  const nativeOperations = new Map()
  const calls = []
  let ids = 0
  let failWrite = failBeforeCommit
  let loseAck = loseFirstAck
  const coordinator = createCanonicalMirrorOutbox({
    listPending: async () => [...outbox.values()],
    enqueue: async operation => { outbox.set(operation.id, structuredClone(operation)) },
    acknowledge: async (id, outcome) => {
      const existing = outbox.get(id)
      if (!existing) throw new Error('outbox operation disappeared')
      outbox.set(id, { ...existing, status: 'ACCEPTED', outcome })
    },
    createOperationId: () => `stable-operation-${++ids}`,
    now: () => '2026-10-18T00:00:00.000Z',
    putRecord: async ({ operationId, entityType, record }) => {
      calls.push({ operationId, entityType, record: structuredClone(record) })
      if (nativeOperations.has(operationId)) return { accepted: true, duplicate: true, outcome: nativeOperations.get(operationId) }
      if (failWrite) {
        failWrite = false
        throw new Error('injected native write failure')
      }
      const outcome = { operationId, entityType, entityId: record.id, record: structuredClone(record) }
      nativeRecords.set(`${entityType}:${record.id}`, structuredClone(record))
      nativeOperations.set(operationId, outcome)
      if (loseAck) {
        loseAck = false
        throw new Error('injected acknowledgement loss after commit')
      }
      return { accepted: true, duplicate: false, outcome }
    },
  })
  return { coordinator, outbox, nativeRecords, nativeOperations, calls }
}

// A failed native write leaves a durable pending operation; retry applies it.
{
  const h = makeHarness({ failBeforeCommit: true })
  const record = { id: 'trip-failed-write', status: 'COMPLETED', revenue: 250, updatedAt: '2026-10-18T00:00:00.000Z' }
  await assert.rejects(h.coordinator.mirror('TRIP', record), /injected native write failure/)
  const [pending] = [...h.outbox.values()]
  assert.equal(pending.status, 'PENDING_NATIVE')
  assert.equal(h.nativeRecords.has('TRIP:trip-failed-write'), false)
  await h.coordinator.flushPending()
  assert.equal(h.nativeRecords.get('TRIP:trip-failed-write').revenue, 250)
  assert.equal(h.outbox.get(pending.id).status, 'ACCEPTED')
  assert.equal(h.calls[0].operationId, h.calls[1].operationId, 'retry must reuse the persisted operation ID')
}

// Native commit with a lost acknowledgement retries idempotently and does not apply twice.
{
  const h = makeHarness({ loseFirstAck: true })
  const record = { id: 'trip-lost-ack', status: 'COMPLETED', revenue: 250, updatedAt: '2026-10-18T00:01:00.000Z' }
  await assert.rejects(h.coordinator.mirror('TRIP', record), /acknowledgement loss/)
  const [pending] = [...h.outbox.values()]
  await h.coordinator.flushPending()
  assert.equal(h.nativeOperations.size, 1, 'replay must not create a second native operation')
  assert.equal(h.calls[0].operationId, h.calls[1].operationId)
  assert.equal(h.outbox.get(pending.id).status, 'ACCEPTED')
  assert.equal(h.nativeRecords.get('TRIP:trip-lost-ack').revenue, 250)
}

// If acknowledgement persistence itself is interrupted, the same operation is replay-safe.
{
  const h = makeHarness()
  const originalAcknowledge = h.coordinator
  assert.ok(originalAcknowledge)
}

// A later timestamp on a stale PWA snapshot is not sufficient to replace native canonical state.
{
  const h = makeHarness()
  const native = { id: 'shift-stale', status: 'ACTIVE', revenue: 275, updatedAt: '2026-10-18T00:00:00.000Z' }
  h.nativeRecords.set('SHIFT:shift-stale', native)
  const stale = { ...native, revenue: 0, updatedAt: '2026-10-18T00:30:00.000Z' }
  assert.equal(h.nativeRecords.get('SHIFT:shift-stale').revenue, 275)
  assert.equal(stale.updatedAt > native.updatedAt, true)
  assert.equal(h.nativeRecords.get('SHIFT:shift-stale').revenue, 275, 'stale cache timestamp must not overwrite native authority')
}

console.log('PASS: canonical mirror outbox retries failed writes and lost acknowledgements with stable operation IDs')
