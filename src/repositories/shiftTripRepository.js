import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { normalizeShiftInput, normalizeTripInput } from '../domain/canonicalNormalization.js'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { transitionTrip, TRIP_STATES } from '../domain/work/tripLifecycle.js'

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
const applyTripCorrection = (trip, data, now) => { const normalized = normalizeTripInput(data); if (normalized.operator !== undefined) trip.operator = normalized.operator; if (normalized.tripKm !== undefined) { trip.tripKm = normalized.tripKm; trip.tripKmAuthority = 'MANUAL'; if (normalized.tripKmProvenance !== undefined) trip.tripKmProvenance = normalized.tripKmProvenance }; if (normalized.revenue !== undefined) { trip.revenue = normalized.revenue; if (trip.status === 'CANCELLED') trip.cancelledRevenue = normalized.revenue; trip.revenueAuthority = 'SUPPORTING_ONLY'; if (normalized.revenueProvenance !== undefined) trip.revenueProvenance = normalized.revenueProvenance }; if (normalized.cancelReason !== undefined) trip.cancelReason = normalized.cancelReason; trip.updatedAt = now; return trip }
const requireFinite = (value, field) => { const result = Number(value); if (!Number.isFinite(result)) throw new Error(`${field} must be a finite number.`); return result }

export const ShiftTripRepository = {
  async createShift(data) { const normalized = normalizeShiftInput(data); const now = new Date().toISOString(); const startOdometer = requireFinite(normalized.startOdometer, 'startOdometer'); const record = { id: normalized.id || generateUUID(), startOdometer, openingPersonalKm: Number(normalized.openingPersonalKm || 0), openingDeadKm: Number(normalized.openingDeadKm || 0), openingPersonalToll: Number(normalized.openingPersonalToll || 0), openingPersonalParking: Number(normalized.openingPersonalParking || 0), openingBaselineType: normalized.openingBaselineType || 'POST_KFE_GAP', historicalOdometerGapKm: Number(normalized.historicalOdometerGapKm || 0), businessStartDate: normalized.businessStartDate || null, businessStartOdometer: Number.isFinite(Number(normalized.businessStartOdometer)) ? Number(normalized.businessStartOdometer) : null, endOdometer: null, totalDistance: 0, revenue: 0, toll: 0, parking: 0, tollParkingRevenueTreatment: 'INCLUDED', shiftStartAt: normalized.shiftStartAt || now, shiftEndAt: null, status: 'ACTIVE', createdAt: now, updatedAt: now }; await atomic(['shifts'], (_, m, a) => { _.objectStore('shifts').put(record); saveMutation(m, a, record.id, 'SHIFT', 'CREATE', record, now) }); return record },
  async completeShift(data) {
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite'); const shifts = tx.objectStore('shifts'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const shiftRequest = shifts.get(data.id)
      shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift) { try { tx.abort() } catch (_) {}; reject(new Error('Active shift not found.')); return }; if (shift.status !== 'ACTIVE') { try { tx.abort() } catch (_) {}; reject(new Error('Shift is not active.')); return }; const now = new Date().toISOString(); const correctionById = new Map((data.trips || []).filter(item => item?.id).map(item => [item.id, item])); const completedTripsRequest = trips.getAll(); completedTripsRequest.onsuccess = () => { try { const completedTrips = (completedTripsRequest.result || []).filter(trip => trip.shiftId === shift.id && trip.status === 'COMPLETED'); for (const trip of completedTrips) { const correction = correctionById.get(trip.id); if (!correction) continue; const updatedTrip = applyTripCorrection(trip, correction, now); trips.put(updatedTrip); saveMutation(mutations, audit, updatedTrip.id, 'TRIP', 'UPDATE', updatedTrip, now) } const normalized = normalizeShiftInput(data); shift.endOdometer = requireFinite(normalized.endOdometer, 'endOdometer'); if (shift.endOdometer < shift.startOdometer) throw new Error('endOdometer cannot be less than startOdometer.'); shift.totalDistance = shift.endOdometer - shift.startOdometer; shift.revenue = Number(normalized.revenue || 0); shift.toll = Number(normalized.toll || 0); shift.parking = Number(normalized.parking || 0); shift.tollParkingRevenueTreatment = normalized.tollParkingRevenueTreatment || 'INCLUDED'; if (data.movementReconciliation) shift.movementReconciliation = data.movementReconciliation; if (data.revenueReconciliation) shift.revenueReconciliation = data.revenueReconciliation; shift.shiftEndAt = now; shift.status = 'COMPLETED'; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) } catch (error) { try { tx.abort() } catch (_) {}; reject(error) } }; completedTripsRequest.onerror = () => { const error = completedTripsRequest.error || new Error('Trip correction lookup failed.'); try { tx.abort() } catch (_) {}; reject(error) } }
      shiftRequest.onerror = () => reject(shiftRequest.error || new Error('Active shift lookup failed.')); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['shifts', 'trips'], reason: 'shift-trip:completeShift' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Atomic shift completion failed.')); tx.onabort = () => reject(tx.error || new Error('Atomic shift completion aborted.'))
    })
  },
  async createTrip(data) { const normalized = normalizeTripInput(data); if (!normalized.shiftId) throw new Error('shiftId is required for a Trip.'); const now = new Date().toISOString(); const record = { id: normalized.id || generateUUID(), shiftId: normalized.shiftId, operator: normalized.operator, tripStartAt: normalized.tripStartAt || now, tripEndAt: null, status: 'ACTIVE', tripStartLocation: normalized.tripStartLocation || null, tripEndLocation: null, tripKm: normalized.tripKm ?? null, tripKmAuthority: normalized.tripKm !== undefined ? 'MANUAL' : 'ESTIMATE', tripKmProvenance: normalized.tripKmProvenance ?? null, revenue: normalized.revenue ?? null, revenueAuthority: normalized.revenue !== undefined ? 'SUPPORTING_ONLY' : 'SUPPORTING_ONLY', revenueProvenance: normalized.revenueProvenance ?? null, cancelledRevenue: null, cancelReason: null, createdAt: now, updatedAt: now }; await atomic(['trips'], (_, m, a) => { _.objectStore('trips').put(record); saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now) }); return record },
  async setTripStartLocation(id, location) {
    return this._setTripLocation(id, location, 'tripStartLocation')
  },
  async setTripStage(id, stage) {
    if (!id || !stage) return false
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(id)
      request.onsuccess = () => { const trip = request.result; if (!trip || trip.status !== 'ACTIVE') { try { tx.abort() } catch (_) {}; resolve(false); return }; trip.tripStage = String(stage); trip.updatedAt = now; trips.put(trip); saveMutation(mutations, audit, trip.id, 'TRIP', 'UPDATE', trip, now) }
      request.onerror = () => reject(request.error || new Error('Trip stage lookup failed.'))
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:stage' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip stage update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip stage update aborted.'))
    })
  },
  async updateTripLocationPlaceName(id, eventType, placeName) {
    if (!id || !placeName) return false
    const db = await initializeCanonicalStorage(); const now = new Date().toISOString()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
      const request = trips.get(id)
      request.onsuccess = () => {
        const trip = request.result
        if (!trip) { try { tx.abort() } catch (_) {}; resolve(false); return }
        const key = eventType === 'START' ? 'tripStartLocation' : eventType === 'END' || eventType === 'CANCELLED' ? 'tripEndLocation' : null
        if (!key || !trip[key]) { try { tx.abort() } catch (_) {}; resolve(false); return }
        trip[key] = { ...trip[key], placeName: String(placeName).trim() }
        trip.updatedAt = now
        trips.put(trip)
        writeMutationAndAudit(mutations, audit, { entityId: trip.id, entityType: 'TRIP', action: 'UPDATE', payload: trip, createdAt: now })
      }
      request.onerror = () => reject(request.error || new Error('Trip lookup failed.'))
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error || new Error('Trip place-name update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip place-name update aborted.'))
    })
  },
  async setTripEndLocation(id, location) {
    return this._setTripLocation(id, location, 'tripEndLocation')
  },
  async _setTripLocation(id, location, field) {
    if (!id || !location) return false
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
      const request = trips.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || (field === 'tripStartLocation' && record.status !== 'ACTIVE')) { try { tx.abort() } catch (_) {}; resolve(false); return }
        const normalized = { latitude: Number(location.latitude), longitude: Number(location.longitude), accuracy: location.accuracy == null ? null : Number(location.accuracy), placeName: location.placeName || null, capturedAt: location.capturedAt || new Date().toISOString() }
        if (!Number.isFinite(normalized.latitude) || !Number.isFinite(normalized.longitude)) { try { tx.abort() } catch (_) {}; resolve(false); return }
        record[field] = normalized
        record.updatedAt = new Date().toISOString()
        trips.put(record)
        saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, record.updatedAt)
      }
      request.onerror = () => reject(request.error || new Error('Trip location lookup failed.'))
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:location' }); resolve(true) }
      tx.onerror = () => reject(tx.error || new Error('Trip location update failed.'))
      tx.onabort = () => { if (tx.error) reject(tx.error) }
    })
  },
  async completeTrip(data) { return this._finishTrip(data, 'COMPLETED') },
  async cancelTrip(data) { return this._finishTrip(data, 'CANCELLED') },
  async _finishTrip(data, status) {
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite'); const shifts = tx.objectStore('shifts'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status === status && TERMINAL_STATES.has(status)) { resolve(true); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'ACTIVE') { reject(new Error('Trip is not active.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); const next = transitionTrip(record, status, data); next.tripEndAt = data.tripEndAt || now; next.tripEndLocation = data.tripEndLocation || null; next.updatedAt = now; trips.put(next); saveMutation(mutations, audit, next.id, 'TRIP', 'UPDATE', next, now) }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: `trip:${status}` }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip update aborted.'))
    })
  },
  async updateTrip(data) {
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'shifts', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const shifts = tx.objectStore('shifts'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'COMPLETED' && record.status !== 'CANCELLED') { reject(new Error('Only completed or cancelled trips can be corrected.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); applyTripCorrection(record, data, now); trips.put(record); saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now); const shiftRequest = shifts.get(record.shiftId); shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift || shift.status !== 'COMPLETED') return; const allTripsRequest = trips.getAll(); allTripsRequest.onsuccess = () => { const reconciliation = reconcileShiftRevenue({ shiftRevenue: shift.revenue, trips: allTripsRequest.result.filter(trip => trip.shiftId === shift.id), toll: shift.toll, parking: shift.parking, tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment }); shift.revenueReconciliation = reconciliation; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) }; allTripsRequest.onerror = () => { try { tx.abort() } catch (_) {} } }; shiftRequest.onerror = () => { try { tx.abort() } catch (_) {} } }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:UPDATE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip correction failed.')); tx.onabort = () => reject(tx.error || new Error('Trip correction aborted.'))
    })
  },
  async getAllShifts() { return readAll('shifts') },
  async getTripsForShift(shiftId) { const trips = await readAll('trips'); return trips.filter(t => t.shiftId === shiftId).sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt)) },
  async getAllTrips() { return readAll('trips') },
  async getCompletedTripsForShift(shiftId) { const trips = await this.getTripsForShift(shiftId); return trips.filter(t => t.status === 'COMPLETED') },
  async getBusinessStartBaseline() { const vehicles = await readAll('vehicles'); const active = vehicles.filter(v => !v.deleted && v.status !== 'Sold' && Number.isFinite(Number(v.openingOdometerKm))); const vehicle = active.sort((a, b) => String(a.acquiredOn || '').localeCompare(String(b.acquiredOn || '')))[0] || null; return vehicle ? { businessStartDate: vehicle.acquiredOn || null, businessStartOdometer: Number(vehicle.openingOdometerKm) } : null },
  async getLastCompletedShift() { const shifts = await readAll('shifts'); return shifts.filter(s => s.status === 'COMPLETED' && Number.isFinite(Number(s.endOdometer))).sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt))[0] || null },
  async getLastCompletedTrip() { const trips = await readAll('trips'); return trips.filter(t => t.status === 'COMPLETED' && t.operator).sort((a, b) => new Date(b.tripEndAt || b.updatedAt) - new Date(a.tripEndAt || a.updatedAt))[0] || null },
  async getActive() { const [shifts, trips] = await Promise.all([readAll('shifts'), readAll('trips')]); return { shift: shifts.find(s => s.status === 'ACTIVE') || null, trip: trips.find(t => t.status === 'ACTIVE') || null } }
}
