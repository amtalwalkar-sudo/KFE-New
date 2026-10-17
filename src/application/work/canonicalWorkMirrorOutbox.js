/**
 * Durable retry wrapper for native canonical writes.
 *
 * The IndexedDB outbox stores the exact operation ID and payload before SQLite is
 * called. If the native transaction commits but its acknowledgement is lost, a
 * retry reuses that operation ID and the native operation log returns the committed
 * outcome instead of applying a second mutation.
 */
export const createCanonicalMirrorOutbox = ({
  listPending,
  enqueue,
  acknowledge,
  putRecord,
  createOperationId,
  now = () => new Date().toISOString(),
}) => {
  const commitPending = async pending => {
    const outcome = await putRecord({
      operationId: pending.id,
      entityType: pending.entityType,
      record: pending.record,
    })
    if (outcome?.accepted !== true) {
      throw new Error(`Native canonical ${pending.entityType} commit was not acknowledged.`)
    }
    await acknowledge(pending.id, outcome)
    return outcome
  }

  return Object.freeze({
    async mirror(entityType, record) {
      if (!record?.id) throw new Error('Canonical mirror requires record.id.')
      const pending = {
        id: createOperationId(),
        command: 'NATIVE_MIRROR_PUT_RECORD',
        entityType,
        entityId: record.id,
        status: 'PENDING_NATIVE',
        record: structuredClone(record),
        createdAt: now(),
      }
      // Do not invoke native persistence until the retry identity and exact payload
      // are durable in IndexedDB.
      await enqueue(pending)
      await commitPending(pending)
      return record
    },
    async flushPending() {
      const pending = (await listPending()).filter(item =>
        item?.command === 'NATIVE_MIRROR_PUT_RECORD' && item.status === 'PENDING_NATIVE'
      ).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      for (const operation of pending) await commitPending(operation)
      return pending.length
    },
  })
}
