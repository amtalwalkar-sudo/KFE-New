import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { normalizeShiftInput, normalizeTripInput } from '../domain/canonicalNormalization.js'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { deriveLiveRevenue } from '../domain/work/liveRevenue.js'
import { createCanonicalShiftRecord, createCanonicalTripRecord } from '../domain/work/canonicalWorkRecords.js'
import { transitionTrip, transitionTripStage, TRIP_STATES } from '../domain/work/tripLifecycle.js'

const TERMINAL_STATES = new Set([TRIP_STATES.COMPLETED, TRIP_STATES.CANCELLED])
const atomic = async (stores, writer) => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores, 'pending_mutations', 'audit_history'], 'readwrite'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
    try { writer(tx, mutations, audit) } catch (error) { reject(error); try { tx.abort() } catch (_) {}; return }
    tx.oncomplete = () => { notifyCanonicalDataChanged({ stores, reason: 'shift-trip:mutation' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Lifecycle persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Lifecycle transaction aborted.'))
  })
}
const saveMutation = (mutationStore, auditStore, entityId, entityType, action, payload, createdAt) => writeMutationAndAudit(mutationStore, auditStore, { entityId, entityType, action, payload, createdAt })
const readAll = async storeName => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const tx = db.transaction([storeName], 'readonly'); const request = tx.objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error(`${storeName} query failed.`)) }) }
const applyTripCorrection = (trip, data, now) => { const normalized = normalizeTripInput(data); if (normalized.operator !== undefined) trip.operator = normalized.operator; if (normalized.tripKm !== undefined) { trip.tripKm = normalized.tripKm; trip.tripKmAuthority = 'MANUAL'; if (normalized.tripKmProvenance !== undefined) trip.tripKmProvenance = normalized.tripKmProvenance }; if (normalized.revenue !== undefined) { trip.revenue = normalized.revenue; if (trip.status === 'CANCELLED') trip.cancelledRevenue = normalized.revenue; trip.revenueAuthority = 'SUPPORTING_ONLY'; if (normalized.revenueProvenance !== undefined) trip.revenueProvenance = normalized.revenueProvenance }; if (normalized.toll !== undefined) trip.toll = normalized.toll; if (normalized.parking !== undefined) trip.parking = normalized.parking; if (normalized.tollTreatment !== undefined) trip.tollTreatment = normalized.tollTreatment; if (normalized.parkingTreatment !== undefined) trip.parkingTreatment = normalized.parkingTreatment; if (normalized.cancelReason !== undefined) trip.cancelReason = normalized.cancelReason; if (normalized.fareDetailsSkipped !== undefined) trip.fareDetailsSkipped = normalized.fareDetailsSkipped; trip.updatedAt = now; return trip }
const requireFinite = (value, field) => { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} must be a finite number.`); return result }
const stableRecordValue = value => {
  if (Array.isArray(value)) return value.map(stableRecordValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableRecordValue(value[key])]))
  return value
}
const sameRecordValue = (left, right) => JSON.stringify(stableRecordValue(left)) === JSON.stringify(stableRecordValue(right))
const compareRecordVersion = (left, right) => {
  const a = Date.parse(left?.updatedAt || '')
  const b = Date.parse(right?.updatedAt || '')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.sign(a - b)
}

// Application-layer canonical reconciliation is injected to keep repository
// code independent from platform adapters and application services.
let canonicalReadBoundary = async () => {}
const ensureCanonicalReadBoundary = () => canonicalReadBoundary()
export const configureCanonicalReadBoundary = boundary => {
  if (typeof boundary !== 'function') throw new TypeError('Canonical read boundary must be a function.')
  canonicalReadBoundary = boundary
}

export const ShiftTripRepository = {
  async createShift(data) { await ensureCanonicalReadBoundary();
    const now = new Date().toISOString()
    const proposed = createCanonicalShiftRecord(data, { createId: generateUUID, now })
    const intentKey = String(data?.createIntentKey || data?.idempotencyKey || '').trim()
    const intentId = intentKey ? `create-intent:SHIFT:${intentKey}` : `create-intent:SHIFT:record:${proposed.id}`
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'canonical_operations', 'pending_mutations', 'audit_history'], 'readwrite')
      const shifts = tx.objectStore('shifts')
      const intents = tx.objectStore('canonical_operations')
      const intentRequest = intents.get(intentId)
      let result = null
      let failure = null
      intentRequest.onsuccess = () => {
        const priorIntent = intentRequest.result
        if (priorIntent) {
          if (intentKey && priorIntent.intentKey !== intentKey) {
            failure = new Error('Shift create-intent key collision; refusing to reuse a different workflow.')
            try { tx.abort() } catch (_) {}
            return
          }
          result = priorIntent.record
          return
        }
        const activeRequest = shifts.getAll()
        activeRequest.onsuccess = () => {
          const active = (activeRequest.result || []).find(shift => shift.status === 'ACTIVE')
          if (active) {
            failure = new Error('Cannot start another shift while a shift is already active.')
            try { tx.abort() } catch (_) {}
            return
          }
          const intent = { id: intentId, entityType: 'SHIFT', intentKey: intentKey || null, record: proposed, status: 'COMPLETED', createdAt: now }
          intents.add(intent)
          shifts.add(proposed)
          saveMutation(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), proposed.id, 'SHIFT', 'CREATE', proposed, now)
          result = proposed
        }
        activeRequest.onerror = () => { failure = activeRequest.error || new Error('Unable to validate active shifts.'); try { tx.abort() } catch (_) {} }
      }
      intentRequest.onerror = () => { failure = intentRequest.error || new Error('Unable to read durable shift create intent.'); try { tx.abort() } catch (_) {} }
      tx.oncomplete = () => {
        notifyCanonicalDataChanged({ stores: ['shifts'], reason: 'shift-trip:create-shift' })
        resolve(result)
      }
      tx.onerror = () => reject(failure || tx.error || new Error('Shift creation transaction failed.'))
      tx.onabort = () => reject(failure || tx.error || new Error('Shift creation transaction aborted.'))
    })
  },
  async completeShift(data) { await ensureCanonicalReadBoundary();
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const shifts = tx.objectStore('shifts')
      const trips = tx.objectStore('trips')
      const mutations = tx.objectStore('pending_mutations')
      const audit = tx.objectStore('audit_history')
      const request = shifts.get(data.id)
      request.onsuccess = () => {
        const shift = request.result
        if (!shift) {
          try { tx.abort() } catch (_) {}
          reject(new Error('Active shift not found.'))
          return
        }
        if (shift.status !== 'ACTIVE') {
          try { tx.abort() } catch (_) {}
          reject(new Error('Shift is not active.'))
          return
        }
        const tripsRequest = trips.getAll()
        tripsRequest.onsuccess = () => {
          try {
            const now = new Date().toISOString()
            const normalized = normalizeShiftInput(data)
            const shiftTrips = tripsRequest.result.filter(trip => trip.shiftId === shift.id)
            if (shiftTrips.some(trip => trip.status === 'ACTIVE')) {
              throw new Error('Cannot complete a shift while a trip is active. Complete or cancel the trip first.')
            }
            // Financial authority is a canonical projection of eligible saved trip
            // fares and cancellation fees; never preserve a manually-entered shift total.
            shift.revenue = deriveLiveRevenue(shiftTrips)
            shift.liveFareRevenue = shift.revenue
            shift.revenueSource = 'TRIP_FARES'
            shift.revenueReconciliation = reconcileShiftRevenue({
              shiftRevenue: shift.revenue,
              trips: shiftTrips,
              toll: shift.toll,
              parking: shift.parking,
              tollTreatment: shift.tollTreatment,
              parkingTreatment: shift.parkingTreatment,
              tollParkingCaptureMode: shift.tollParkingCaptureMode,
              tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment
            })
            shift.endOdometer = requireFinite(normalized.endOdometer, 'endOdometer')
            if (shift.endOdometer < shift.startOdometer) throw new Error('endOdometer cannot be less than startOdometer.')
            shift.totalDistance = shift.endOdometer - shift.startOdometer
            if (data.movementReconciliation) shift.movementReconciliation = data.movementReconciliation
            shift.shiftEndAt = now
            shift.shiftDurationMs = Math.max(0, Date.parse(now) - Date.parse(shift.shiftStartAt || now))
            shift.status = 'COMPLETED'
            shift.updatedAt = now
            // On Android, the native mirror's operation ID and exact payload
            // fingerprint must be durable in the same transaction as COMPLETED.
            // Otherwise a process death before mirrorCanonicalRecord journals
            // the write can let recovery restore the stale native ACTIVE record.
            const canonicalSyncOperationId = String(data.canonicalSyncOperationId || '').trim()
            const writeRecord = canonicalSyncOperationId
              ? {
                  ...shift,
                  _nativeCanonicalSync: {
                    operationId: canonicalSyncOperationId,
                    fingerprint: JSON.stringify(stableRecordValue(shift))
                  }
                }
              : shift
            shifts.put(writeRecord)
            saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now)
          } catch (error) {
            try { tx.abort() } catch (_) {}
            reject(error)
          }
        }
        tripsRequest.onerror = () => {
          try { tx.abort() } catch (_) {}
          reject(tripsRequest.error || new Error('Shift trip revenue projection failed.'))
        }
      }
      request.onerror = () => reject(request.error || new Error('Active shift lookup failed.'))
      tx.oncomplete = () => {
        notifyCanonicalDataChanged({ stores: ['shifts'], reason: 'shift-trip:completeShift' })
        resolve(true)
      }
      tx.onerror = () => reject(tx.error || new Error('Atomic shift completion failed.'))
      tx.onabort = () => reject(tx.error || new Error('Atomic shift completion aborted.'))
    })
  },
  async createTrip(data) { await ensureCanonicalReadBoundary();
    const now = new Date().toISOString()
    const proposed = createCanonicalTripRecord(data, { createId: generateUUID, now })
    const intentKey = String(data?.createIntentKey || data?.idempotencyKey || '').trim()
    const intentId = intentKey ? `create-intent:TRIP:${intentKey}` : `create-intent:TRIP:record:${proposed.id}`
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'canonical_operations', 'pending_mutations', 'audit_history'], 'readwrite')
      const shifts = tx.objectStore('shifts')
      const trips = tx.objectStore('trips')
      const intents = tx.objectStore('canonical_operations')
      const intentRequest = intents.get(intentId)
      let result = null
      let failure = null
      intentRequest.onsuccess = () => {
        const priorIntent = intentRequest.result
        if (priorIntent) {
          if (intentKey && priorIntent.intentKey !== intentKey) {
            failure = new Error('Trip create-intent key collision; refusing to reuse a different workflow.')
            try { tx.abort() } catch (_) {}
            return
          }
          result = priorIntent.record
          return
        }
        const shiftRequest = shifts.get(proposed.shiftId)
        const tripsRequest = trips.getAll()
        let ready = 0
        const validateAndWrite = () => {
          if (++ready !== 2) return
          const shift = shiftRequest.result
          if (!shift || shift.status !== 'ACTIVE') {
            failure = new Error('Cannot create a trip without an active parent shift.')
            try { tx.abort() } catch (_) {}
            return
          }
          if ((tripsRequest.result || []).some(trip => trip.shiftId === proposed.shiftId && trip.status === 'ACTIVE')) {
            failure = new Error('Cannot create another trip while this shift already has an active trip.')
            try { tx.abort() } catch (_) {}
            return
          }
          intents.add({ id: intentId, entityType: 'TRIP', intentKey: intentKey || null, record: proposed, status: 'COMPLETED', createdAt: now })
          trips.add(proposed)
          saveMutation(tx.objectStore('pending_mutations'), tx.objectStore('audit_history'), proposed.id, 'TRIP', 'CREATE', proposed, now)
          result = proposed
        }
        shiftRequest.onsuccess = validateAndWrite
        tripsRequest.onsuccess = validateAndWrite
        shiftRequest.onerror = () => { failure = shiftRequest.error || new Error('Unable to validate parent shift.'); try { tx.abort() } catch (_) {} }
        tripsRequest.onerror = () => { failure = tripsRequest.error || new Error('Unable to validate active trips.'); try { tx.abort() } catch (_) {} }
      }
      intentRequest.onerror = () => { failure = intentRequest.error || new Error('Unable to read durable trip create intent.'); try { tx.abort() } catch (_) {} }
      tx.oncomplete = () => {
        notifyCanonicalDataChanged({ stores: ['shifts', 'trips'], reason: 'shift-trip:create' })
        resolve(result)
      }
      tx.onerror = () => reject(failure || tx.error || new Error('Trip creation transaction failed.'))
      tx.onabort = () => reject(failure || tx.error || new Error('Trip creation transaction aborted.'))
    })
  },
  async setTripStartLocation(id, location) { return this._setTripLocation(id, location, 'tripStartLocation') },
  async setTripEndLocation(id, location) { return this._setTripLocation(id, location, 'tripEndLocation') },
  async _setTripLocation(id, location, field) { await ensureCanonicalReadBoundary();
    if (!id || !location || !['tripStartLocation', 'tripEndLocation'].includes(field)) return false
    const latitude = Number(location.latitude), longitude = Number(location.longitude)
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return false
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const trips = tx.objectStore('trips'), mutations = tx.objectStore('pending_mutations'), audit = tx.objectStore('audit_history')
      const request = trips.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record) { try { tx.abort() } catch (_) {}; resolve(false); return }
        if (record[field]) return
        const fixDate = new Date(location.capturedAt)
        if (!Number.isFinite(fixDate.getTime()) || fixDate.getTime() <= 0) {
          // Coordinates without the provider's actual fix timestamp are not a
          // valid trip-boundary snapshot. Never fabricate one from save time.
          resolve(false)
          return
        }
        const now = new Date().toISOString()
        const accuracyValue = location.accuracy == null || location.accuracy === '' ? null : Number(location.accuracy)
        record[field] = {
          latitude, longitude,
          accuracy: Number.isFinite(accuracyValue) && accuracyValue >= 0 ? accuracyValue : null,
          placeName: null,
          capturedAt: fixDate.toISOString()
        }
        record[field + 'Status'] = 'CAPTURED'
        // GPS is optional metadata, not a business transition. Keep the
        // canonical trip version stable so a late fix cannot stale a fare form.
        trips.put(record)
        saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now)
      }
      request.onerror = () => reject(request.error || new Error('Trip location lookup failed.'))
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:boundary-location' }); resolve(true) }
      tx.onerror = () => reject(tx.error || new Error('Trip boundary location update failed.'))
      tx.onabort = () => reject(tx.error || new Error('Trip boundary location update aborted.'))
    })
  },
  async setTripStage(id, stage) { await ensureCanonicalReadBoundary();
    if (!id || !stage) return false
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString()
    let updatedTrip = null
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(id)
      request.onsuccess = () => { const trip = request.result; if (!trip || trip.status !== 'ACTIVE') { try { tx.abort() } catch (_) {}; resolve(false); return }; let transitioned; try { transitioned = transitionTripStage(trip, stage, { at: now }) } catch (_) { try { tx.abort() } catch (_) {}; resolve(false); return }; Object.assign(trip, transitioned); trip.updatedAt = now; trips.put(trip); saveMutation(mutations, audit, trip.id, 'TRIP', 'UPDATE', trip, now); updatedTrip = trip }
      request.onerror = () => reject(request.error || new Error('Trip stage lookup failed.'))
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:stage' }); resolve(updatedTrip || true) }; tx.onerror = () => reject(tx.error || new Error('Trip stage update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip stage update aborted.'))
    })
  },
  async completeTrip(data) { return this._finishTrip(data, 'COMPLETED') },
  async cancelTrip(data) { return this._finishTrip(data, 'CANCELLED') },
  async _finishTrip(data, status) { await ensureCanonicalReadBoundary();
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite'); const shifts = tx.objectStore('shifts'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status === status && TERMINAL_STATES.has(status)) { resolve(true); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'ACTIVE') { reject(new Error('Trip is not active.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); const next = transitionTrip(record, status, data); next.tripEndAt = data.tripEndAt || record.tripEndAt || now; next.updatedAt = now; trips.put(next); saveMutation(mutations, audit, next.id, 'TRIP', 'UPDATE', next, now); const shiftRequest = shifts.get(next.shiftId); shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift) return; const allTripsRequest = trips.getAll(); allTripsRequest.onsuccess = () => { const shiftTrips = allTripsRequest.result.filter(trip => trip.shiftId === shift.id); shift.revenue = deriveLiveRevenue(shiftTrips); shift.liveFareRevenue = shift.revenue; shift.revenueSource = 'TRIP_FARES'; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) }; allTripsRequest.onerror = () => { try { tx.abort() } catch (_) {} } }; shiftRequest.onerror = () => { try { tx.abort() } catch (_) {} } }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: `trip:${status}` }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip update aborted.'))
    })
  },
  async updateTrip(data) { await ensureCanonicalReadBoundary();
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'shifts', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const shifts = tx.objectStore('shifts'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'COMPLETED' && record.status !== 'CANCELLED') { reject(new Error('Only completed or cancelled trips can be corrected.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); applyTripCorrection(record, data, now); trips.put(record); saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now); const shiftRequest = shifts.get(record.shiftId); shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift) return; const allTripsRequest = trips.getAll(); allTripsRequest.onsuccess = () => { const shiftTrips = allTripsRequest.result.filter(trip => trip.shiftId === shift.id); shift.revenue = deriveLiveRevenue(shiftTrips); shift.liveFareRevenue = shift.revenue; shift.revenueSource = 'TRIP_FARES'; const reconciliation = reconcileShiftRevenue({ shiftRevenue: shift.revenue, trips: shiftTrips, toll: shift.toll, parking: shift.parking, tollTreatment: shift.tollTreatment, parkingTreatment: shift.parkingTreatment, tollParkingCaptureMode: shift.tollParkingCaptureMode, tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment }); shift.revenueReconciliation = reconciliation; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) }; allTripsRequest.onerror = () => { try { tx.abort() } catch (_) {} } }; shiftRequest.onerror = () => { try { tx.abort() } catch (_) {} } }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:UPDATE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip correction failed.')); tx.onabort = () => reject(tx.error || new Error('Trip correction aborted.'))
    })
  },
  async getAllShifts({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary(); return readAll('shifts') },
  async getTripsForShift(shiftId, { skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary(); const trips = await readAll('trips'); return trips.filter(t => t.shiftId === shiftId).sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt)) },
  async getAllTrips({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary(); return readAll('trips') },
  async getCompletedTripsForShift(shiftId) { const trips = await this.getTripsForShift(shiftId); return trips.filter(t => t.status === 'COMPLETED') },
  async getPrimaryVehicleId() {
    const registration = 'MH01EM7360'
    const normalizeRegistration = value => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
    const liveVehicle = vehicle => !vehicle?.deleted && !vehicle?.deletedAt && !['SOLD', 'RETIRED', 'TRANSFERRED', 'INACTIVE'].includes(String(vehicle?.status || vehicle?.lifecycle_status || '').toUpperCase())
    let vehicles = (await readAll('vehicles')).filter(liveVehicle)
    let vehicle = vehicles.find(item => normalizeRegistration(item.registrationNumber || item.registration_number) === registration)

    if (!vehicle) {
      // There is one known car today. Reuse an existing active vehicle identity
      // rather than making a second master record just because it lacks a plate.
      vehicle = vehicles.find(item =>
        (item.openingOdometerKm != null && item.openingOdometerKm !== '' && Number.isFinite(Number(item.openingOdometerKm))) ||
        (item.acquisition_odometer != null && item.acquisition_odometer !== '' && Number.isFinite(Number(item.acquisition_odometer)))
      ) || (vehicles.length === 1 ? vehicles[0] : null)
      const now = new Date().toISOString()
      if (vehicle) {
        const updated = { ...vehicle, registrationNumber: registration, registration_number: registration, updatedAt: now }
        await atomic(['vehicles'], (tx, mutations, audit) => {
          tx.objectStore('vehicles').put(updated)
          saveMutation(mutations, audit, updated.id, 'VEHICLE', 'UPDATE', updated, now)
        })
        vehicle = updated
      } else {
        const id = 'vehicle-mh01em7360'
        vehicle = {
          id,
          registrationNumber: registration,
          registration_number: registration,
          status: 'Active',
          lifecycle_status: 'ACTIVE',
          active: true,
          createdAt: now,
          updatedAt: now,
        }
        await atomic(['vehicles'], (tx, mutations, audit) => {
          tx.objectStore('vehicles').put(vehicle)
          saveMutation(mutations, audit, vehicle.id, 'VEHICLE', 'CREATE', vehicle, now)
        })
      }
    }

    // MH01EM7360 is currently the only car. Assign legacy fuel records that
    // predate vehicle IDs to this canonical vehicle so existing history remains
    // usable for full-tank mileage calculations.
    const unlinkedFuel = (await readAll('fuel_logs')).filter(item =>
      !item?.deleted && !item?.deletedAt && (item.vehicleId == null || String(item.vehicleId).trim() === '')
    )
    if (unlinkedFuel.length) {
      const now = new Date().toISOString()
      await atomic(['fuel_logs'], (tx, mutations, audit) => {
        const store = tx.objectStore('fuel_logs')
        for (const record of unlinkedFuel) {
          const linked = { ...record, vehicleId: vehicle.id, updatedAt: now }
          store.put(linked)
          saveMutation(mutations, audit, linked.id, 'FUEL', 'UPDATE', linked, now)
        }
      })
    }
    return vehicle.id
  },
  async getBusinessStartBaseline() { const [vehicles, settings] = await Promise.all([readAll('vehicles'), readAll('settings')]); const active = vehicles.filter(v => !v.deleted && !v.deletedAt && v.status !== 'Sold' && Number.isFinite(Number(v.openingOdometerKm))); const vehicle = active.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0] || null; const setup = settings.find(item => item.settingKey === 'businessSetup' && !item.deleted && !item.deletedAt); const businessStartDate = setup?.values?.businessStartDate || null; return vehicle ? { businessStartDate, businessStartOdometer: Number(vehicle.openingOdometerKm) } : (businessStartDate ? { businessStartDate, businessStartOdometer: null } : null) },
  async getLastCompletedShift() { await ensureCanonicalReadBoundary(); const shifts = await readAll('shifts'); return shifts.filter(s => s.status === 'COMPLETED' && Number.isFinite(Number(s.endOdometer))).sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt))[0] || null },
  async getLastCompletedTrip() { await ensureCanonicalReadBoundary(); const trips = await readAll('trips'); return trips.filter(t => t.status === 'COMPLETED' && t.operator).sort((a, b) => new Date(b.tripEndAt || b.updatedAt) - new Date(a.tripEndAt || a.updatedAt))[0] || null },
  async markCanonicalSyncPending({ entityType, entityId, operationId, fingerprint, record } = {}) {
    const storeName = entityType === 'SHIFT' ? 'shifts' : entityType === 'TRIP' ? 'trips' : null
    if (!storeName || !entityId || !operationId || !fingerprint || !record || record.id !== entityId) throw new Error('entityType, entityId, operationId, fingerprint and matching record are required.')
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite')
      let updated = null
      let failure = null
      const store = tx.objectStore(storeName)
      const request = store.get(entityId)
      request.onsuccess = () => {
        const current = request.result
        if (!current) {
          failure = new Error('Cannot journal a native mirror for a missing local canonical record.')
          try { tx.abort() } catch (_) {}
          return
        }
        const { _nativeCanonicalSync, ...currentPayload } = current
        if (!sameRecordValue(currentPayload, record)) {
          failure = new Error('Local canonical record changed before native mirror; retry with the latest snapshot.')
          try { tx.abort() } catch (_) {}
          return
        }
        updated = { ...current, _nativeCanonicalSync: { operationId, fingerprint } }
        store.put(updated)
      }
      request.onerror = () => { failure = request.error; try { tx.abort() } catch (_) {} }
      tx.oncomplete = () => {
        resolve(updated)
      }
      tx.onerror = () => reject(failure || tx.error || request.error || new Error('Could not persist pending native canonical operation.'))
      tx.onabort = () => reject(failure || tx.error || request.error || new Error('Pending native canonical operation aborted.'))
    })
  },
  async clearCanonicalSyncPending({ entityType, entityId, operationId, fingerprint } = {}) {
    const storeName = entityType === 'SHIFT' ? 'shifts' : entityType === 'TRIP' ? 'trips' : null
    if (!storeName || !entityId || !operationId || !fingerprint) throw new Error('entityType, entityId, operationId and fingerprint are required.')
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite')
      let cleared = false
      const store = tx.objectStore(storeName)
      const request = store.get(entityId)
      request.onsuccess = () => {
        const current = request.result
        if (!current?._nativeCanonicalSync ||
            current._nativeCanonicalSync.operationId !== operationId ||
            current._nativeCanonicalSync.fingerprint !== fingerprint) return
        const { _nativeCanonicalSync, ...currentPayload } = current
        if (JSON.stringify(stableRecordValue(currentPayload)) !== fingerprint) return
        store.put(currentPayload)
        cleared = true
      }
      request.onerror = () => { try { tx.abort() } catch (_) {} }
      tx.oncomplete = () => {
        resolve(cleared)
      }
      tx.onerror = () => reject(tx.error || request.error || new Error('Could not clear acknowledged native canonical operation.'))
      tx.onabort = () => reject(tx.error || request.error || new Error('Acknowledged native canonical operation cleanup aborted.'))
    })
  },
  async syncCanonicalRecords({ shifts = [], trips = [] } = {}) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips'], 'readwrite')
      const shiftStore = tx.objectStore('shifts')
      const tripStore = tx.objectStore('trips')
      let conflict = null
      // This method is called only after an Android-native canonical snapshot has
      // been re-read following acknowledged first-time mirrors. SQLite is the
      // authority for existing records: local updatedAt values are not comparable
      // revision tokens across independent native/PWA writers. Always converge the
      // IndexedDB cache to the authoritative snapshot instead of preserving a
      // potentially newer-but-stale PWA snapshot.
      const queueRecord = (store, canonicalRecord, writeRecord = canonicalRecord) => {
        if (canonicalRecord?.id) store.put(writeRecord)
      }
      const normalizedShifts = shifts.filter(record => record?.id).map(record => {
        const shiftTrips = trips.filter(trip => trip?.shiftId === record.id)
        return { ...record, revenue: deriveLiveRevenue(shiftTrips), liveFareRevenue: deriveLiveRevenue(shiftTrips), revenueSource: 'TRIP_FARES' }
      })
      const normalizedById = new Map(normalizedShifts.map(record => [record.id, record]))
      for (const record of shifts) queueRecord(shiftStore, record, normalizedById.get(record?.id) || record)
      for (const record of trips) queueRecord(tripStore, record)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(conflict || tx.error || new Error('Native canonical recovery failed.'))
      tx.onabort = () => reject(conflict || tx.error || new Error('Native canonical recovery aborted.'))
    })
  },
  async getActive({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary(); const [shifts, trips] = await Promise.all([readAll('shifts'), readAll('trips')]); return { shift: shifts.find(s => s.status === 'ACTIVE') || null, trip: trips.find(t => t.status === 'ACTIVE') || null } }
}
