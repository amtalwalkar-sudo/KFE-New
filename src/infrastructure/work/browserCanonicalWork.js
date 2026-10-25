import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../../utils/indexedDB.js'

const STORE_BY_ENTITY = Object.freeze({ SHIFT: 'shifts', TRIP: 'trips', GPS_SNAPSHOT: 'gps_snapshots', MOVEMENT_ARTIFACT: 'movement_artifacts' })
const requireText = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}
const browserStoreFor = entityType => {
  const store = STORE_BY_ENTITY[entityType]
  if (!store) throw new Error(`Unsupported canonical Work entity type: ${entityType}`)
  return store
}
const operationRecord = (operationId, entityType, entityId, outcome, createdAt) => ({ id: operationId, command: 'PUT_RECORD', entityType, entityId, status: 'ACCEPTED', outcome, createdAt })
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
  }
  return value
}
const jsonEquivalent = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))


const withoutTripBoundarySnapshots = trip => {
  const copy = { ...trip }
  delete copy.tripStartLocation
  delete copy.tripEndLocation
  delete copy.tripStartLocationStatus
  delete copy.tripEndLocationStatus
  return copy
}
const sameShiftExceptRevenueProjection = (left, right) => {
  const a = { ...left }, b = { ...right }
  for (const field of ['updatedAt', 'revenue', 'liveFareRevenue', 'revenueSource']) {
    delete a[field]
    delete b[field]
  }
  return jsonEquivalent(a, b)
}
const parseCanonicalInstant = (value, field) => {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T.*(?:Z|[+-]\\d{2}:\\d{2})$/.test(value)) {
    throw new Error(`Canonical version conflict: ${field} must be a valid ISO-8601 instant.`)
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Canonical version conflict: ${field} must be a valid ISO-8601 instant.`)
  return parsed
}
// Mirrors the native store's compare-and-set and narrowly-scoped lifecycle exceptions.
// This helper is called only from the IndexedDB read-write transaction's request callbacks.
export const assertBrowserCanonicalWriteAllowed = ({ entityType, existingRecord, record, expectedUpdatedAt = null, expectAbsent = false }) => {
  if (!existingRecord) {
    if (expectedUpdatedAt != null) throw new Error(`Canonical version conflict: expected record is missing for ${entityType}/${record.id}.`)
    return record
  }
  if (expectAbsent) throw new Error(`Canonical create conflict: record already exists for ${entityType}/${record.id}.`)
  if (expectedUpdatedAt != null && expectedUpdatedAt !== (existingRecord.updatedAt || '')) {
    throw new Error(`Canonical version conflict: expected version changed for ${entityType}/${record.id}.`)
  }
  if (jsonEquivalent(record, existingRecord)) return record
  const existingVersion = existingRecord.updatedAt || ''
  const incomingVersion = record.updatedAt || ''
  if (!existingVersion || !incomingVersion) throw new Error('Canonical version conflict: updatedAt is required to replace an existing record.')
  const versionOrder = Math.sign(parseCanonicalInstant(incomingVersion, 'updatedAt') - parseCanonicalInstant(existingVersion, 'existing updatedAt'))
  const completesActiveShift = entityType === 'SHIFT' && existingRecord.status === 'ACTIVE' && record.status === 'COMPLETED'
  const activeShiftProjectionCollision = versionOrder <= 0
    && entityType === 'SHIFT'
    && existingRecord.status === 'ACTIVE'
    && record.status === 'ACTIVE'
    && Object.hasOwn(existingRecord, 'revenue')
    && Object.hasOwn(existingRecord, 'liveFareRevenue')
    && existingRecord.revenueSource === 'TRIP_FARES'
    && sameShiftExceptRevenueProjection(existingRecord, record)
  if ((versionOrder <= 0 && completesActiveShift) || activeShiftProjectionCollision) {
    const reconciled = { ...record }
    for (const field of ['revenue', 'liveFareRevenue', 'revenueSource']) {
      if (Object.hasOwn(existingRecord, field)) reconciled[field] = existingRecord[field]
      else delete reconciled[field]
    }
    reconciled.updatedAt = new Date(parseCanonicalInstant(existingVersion, 'existing updatedAt') + 1).toISOString()
    return reconciled
  }
  if (versionOrder < 0) throw new Error(`Stale canonical write rejected for ${entityType}/${record.id}.`)
  if (versionOrder === 0) throw new Error(`Canonical version conflict: different payloads share updatedAt for ${entityType}/${record.id}.`)
  return record
}
const preserveTripBoundaryMetadata = (existing, incoming) => {
  for (const field of ['tripStartLocation', 'tripEndLocation', 'tripStartLocationStatus', 'tripEndLocationStatus']) {
    if (Object.hasOwn(existing, field)) incoming[field] = structuredClone(existing[field])
  }
}
const refreshBrowserShiftRevenueProjection = (shift, trips, committedAt) => {
  if (!shift) return null
  let revenue = 0
  let latest = parseCanonicalInstant(committedAt, 'committedAt')
  if (shift.updatedAt) latest = Math.max(latest, parseCanonicalInstant(shift.updatedAt, 'shift updatedAt'))
  for (const trip of trips || []) {
    if (trip.shiftId !== shift.id || (Object.hasOwn(trip, 'deletedAt') && trip.deletedAt != null) || trip.deleted === true) continue
    if (trip.status === 'COMPLETED' && trip.fareDetailsSkipped !== true && typeof trip.revenue === 'number' && Number.isFinite(trip.revenue) && trip.revenue >= 0) revenue += trip.revenue
    else if (trip.status === 'CANCELLED' && typeof trip.cancelledRevenue === 'number' && Number.isFinite(trip.cancelledRevenue) && trip.cancelledRevenue >= 0) revenue += trip.cancelledRevenue
    if (trip.updatedAt) latest = Math.max(latest, parseCanonicalInstant(trip.updatedAt, 'trip updatedAt'))
  }
  const matches = typeof shift.revenue === 'number' && typeof shift.liveFareRevenue === 'number'
    && Math.abs(shift.revenue - revenue) < 1e-9 && Math.abs(shift.liveFareRevenue - revenue) < 1e-9
    && shift.revenueSource === 'TRIP_FARES'
  if (matches) return null
  return { ...shift, revenue, liveFareRevenue: revenue, revenueSource: 'TRIP_FARES', updatedAt: new Date(latest + 1).toISOString() }
}

export const BrowserCanonicalWorkService = Object.freeze({
  async putRecord({ operationId, entityType, record, expectedUpdatedAt = null, expectAbsent = false } = {}) {
    const db = await initializeCanonicalStorage()
    const storeName = browserStoreFor(requireText(entityType, 'entityType'))
    const entityId = requireText(record?.id, 'record.id')
    const id = requireText(operationId, 'operationId')
    if (expectedUpdatedAt != null && (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim())) throw new Error('expectedUpdatedAt must be a non-empty timestamp or null.')
    const expectedVersion = expectedUpdatedAt == null ? null : expectedUpdatedAt.trim()
    const stores = entityType === 'TRIP'
      ? [storeName, 'shifts', 'canonical_operations', 'audit_history']
      : [storeName, 'canonical_operations', 'audit_history']
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      const records = tx.objectStore(storeName), operations = tx.objectStore('canonical_operations'), audit = tx.objectStore('audit_history')
      let outcome = null
      let failure = null
      const abortWith = error => {
        if (failure) return
        failure = error instanceof Error ? error : new Error(String(error))
        try { tx.abort() } catch (_) {}
      }
      const existingOperation = operations.get(id)
      existingOperation.onsuccess = () => {
        try {
          if (existingOperation.result) {
            const previous = existingOperation.result
            if (previous.command !== 'PUT_RECORD' || previous.entityType !== entityType || previous.entityId !== entityId) throw new Error('operationId was already used for a different command.')
            const previousRecord = previous.outcome?.record
            const samePayload = previousRecord && (entityType === 'TRIP'
              ? jsonEquivalent(withoutTripBoundarySnapshots(previousRecord), withoutTripBoundarySnapshots(record))
              : jsonEquivalent(previousRecord, record))
            if (!samePayload) throw new Error('operationId was already used with a different payload.')
            outcome = { accepted: previous.status === 'ACCEPTED', duplicate: true, outcome: previous.outcome }
            return
          }
          const currentRequest = records.get(entityId)
          currentRequest.onsuccess = () => {
            try {
              const existing = currentRequest.result || null
              const incoming = structuredClone(record)
              if (entityType === 'TRIP' && existing) preserveTripBoundaryMetadata(existing, incoming)
              const savedRecord = assertBrowserCanonicalWriteAllowed({
                entityType, existingRecord: existing, record: incoming,
                expectedUpdatedAt: expectedVersion, expectAbsent: expectAbsent === true,
              })
              const committedAt = new Date().toISOString()
              records.put(savedRecord)
              const finishWrite = () => {
                try {
                  const resultRecord = entityType === 'SHIFT' ? structuredClone(record) : structuredClone(savedRecord)
                  const result = { operationId: id, entityType, entityId, committedAt, record: resultRecord }
                  operations.add(operationRecord(id, entityType, entityId, result, committedAt))
                  audit.add({ id: `canonical-operation:${id}`, mutationId: id, entityId, entityType, action: 'PUT_RECORD', payload: structuredClone(savedRecord), createdAt: committedAt })
                  outcome = { accepted: true, duplicate: false, outcome: result }
                } catch (error) { abortWith(error) }
              }
              if (entityType !== 'TRIP' || !savedRecord.shiftId) { finishWrite(); return }
              const shifts = tx.objectStore('shifts')
              const shiftRequest = shifts.get(savedRecord.shiftId)
              const tripsRequest = records.getAll()
              let shiftReady = false, tripsReady = false, shift = null, trips = []
              const maybeProject = () => {
                if (!shiftReady || !tripsReady || failure) return
                try {
                  const projected = refreshBrowserShiftRevenueProjection(shift, trips, committedAt)
                  if (projected) shifts.put(projected)
                  finishWrite()
                } catch (error) { abortWith(error) }
              }
              shiftRequest.onsuccess = () => { shift = shiftRequest.result || null; shiftReady = true; maybeProject() }
              shiftRequest.onerror = () => abortWith(shiftRequest.error || new Error('Canonical shift projection lookup failed.'))
              tripsRequest.onsuccess = () => { trips = tripsRequest.result || []; tripsReady = true; maybeProject() }
              tripsRequest.onerror = () => abortWith(tripsRequest.error || new Error('Canonical trip projection scan failed.'))
            } catch (error) { abortWith(error) }
          }
          currentRequest.onerror = () => abortWith(currentRequest.error || new Error('Canonical record lookup failed.'))
        } catch (error) { abortWith(error) }
      }
      existingOperation.onerror = () => abortWith(existingOperation.error || new Error('Canonical operation lookup failed.'))
      tx.oncomplete = () => {
        if (failure) { reject(failure); return }
        if (!outcome) { reject(new Error('Canonical persistence completed without an operation outcome.')); return }
        if (!outcome.duplicate) notifyCanonicalDataChanged({ stores: entityType === 'TRIP' ? ['trips', 'shifts'] : [storeName], reason: 'canonical-work:put-record' })
        resolve(outcome)
      }
      tx.onerror = () => reject(failure || tx.error || new Error('Canonical Work transaction failed.'))
      tx.onabort = () => reject(failure || tx.error || new Error('Canonical Work transaction aborted.'))
    })
  },
  async updateTripBoundaryPlaceName({ operationId, tripId, field, placeName } = {}) {
    const db = await initializeCanonicalStorage()
    const id = requireText(operationId, 'operationId')
    const entityId = requireText(tripId, 'tripId')
    const boundaryField = requireText(field, 'field')
    const label = requireText(placeName, 'placeName')
    if (!['tripStartLocation', 'tripEndLocation'].includes(boundaryField)) throw new Error('Unsupported trip-boundary place-name field.')
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'canonical_operations', 'audit_history'], 'readwrite')
      const records = tx.objectStore('trips'), operations = tx.objectStore('canonical_operations'), audit = tx.objectStore('audit_history')
      let outcome = null
      const existingOperation = operations.get(id)
      existingOperation.onsuccess = () => {
        try {
          if (existingOperation.result) {
            const previous = existingOperation.result
            if (previous.command !== 'UPDATE_TRIP_BOUNDARY_PLACE_NAME' || previous.entityId !== entityId
              || previous.outcome?.field !== boundaryField || previous.outcome?.placeName !== label) {
              throw new Error('operationId was already used for a different trip-boundary label.')
            }
            outcome = { accepted: previous.status === 'ACCEPTED', duplicate: true, outcome: previous.outcome }
            return
          }
          const request = records.get(entityId)
          request.onsuccess = () => {
            try {
              const trip = request.result
              if (!trip) throw new Error('Canonical trip does not exist for boundary label.')
              const snapshot = trip[boundaryField]
              if (!snapshot || snapshot.latitude == null || snapshot.longitude == null || !snapshot.capturedAt) {
                throw new Error('A durable GPS boundary snapshot is required before adding its locality label.')
              }
              snapshot.placeName = label
              // Keep the business updatedAt unchanged; this is metadata enrichment only.
              records.put(trip)
              const committedAt = new Date().toISOString()
              const result = { operationId: id, entityType: 'TRIP', entityId, field: boundaryField, placeName: label, record: structuredClone(trip), committedAt }
              operations.add({ id, command: 'UPDATE_TRIP_BOUNDARY_PLACE_NAME', entityType: 'TRIP', entityId, status: 'ACCEPTED', outcome: result, createdAt: committedAt })
              audit.add({ id: `canonical-operation:${id}`, mutationId: id, entityId, entityType: 'TRIP', action: 'UPDATE_TRIP_BOUNDARY_PLACE_NAME', payload: { field: boundaryField, placeName: label }, createdAt: committedAt })
              outcome = { accepted: true, duplicate: false, outcome: result }
            } catch (error) { try { tx.abort() } catch (_) {}; reject(error) }
          }
          request.onerror = () => { try { tx.abort() } catch (_) {}; reject(request.error || new Error('Canonical trip lookup failed.')) }
        } catch (error) { try { tx.abort() } catch (_) {}; reject(error) }
      }
      existingOperation.onerror = () => { try { tx.abort() } catch (_) {}; reject(existingOperation.error || new Error('Canonical operation lookup failed.')) }
      tx.oncomplete = () => {
        if (!outcome) { reject(new Error('Canonical locality update completed without an operation outcome.')); return }
        if (!outcome.duplicate) notifyCanonicalDataChanged({ stores: ['trips'], reason: 'canonical-work:trip-boundary-place-name' })
        resolve(outcome)
      }
      tx.onerror = () => reject(tx.error || new Error('Canonical locality update failed.'))
      tx.onabort = () => reject(tx.error || new Error('Canonical locality update aborted.'))
    })
  },
  async getRecord({ entityType, entityId } = {}) {
    const db = await initializeCanonicalStorage(), storeName = browserStoreFor(requireText(entityType, 'entityType')), id = requireText(entityId, 'entityId')
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly'), request = tx.objectStore(storeName).get(id)
      request.onsuccess = () => resolve(request.result ? { found: true, record: request.result, updatedAt: request.result.updatedAt || null } : { found: false })
      request.onerror = () => reject(request.error || new Error('Canonical record query failed.'))
    })
  },
  async listRecords({ entityType, limit = 500 } = {}) {
    const db = await initializeCanonicalStorage(), storeName = browserStoreFor(requireText(entityType, 'entityType')), safeLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readonly'), request = tx.objectStore(storeName).getAll()
      request.onsuccess = () => { const records = (request.result || []).sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')) || String(a.id).localeCompare(String(b.id))).slice(0, safeLimit); resolve({ entityType, records, count: records.length }) }
      request.onerror = () => reject(request.error || new Error('Canonical record list failed.'))
    })
  },
  async getOperation(operationId) {
    const db = await initializeCanonicalStorage(), id = requireText(operationId, 'operationId')
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['canonical_operations'], 'readonly'), request = tx.objectStore('canonical_operations').get(id)
      request.onsuccess = () => resolve(request.result ? { found: true, ...request.result } : { found: false })
      request.onerror = () => reject(request.error || new Error('Canonical operation query failed.'))
    })
  },
})
