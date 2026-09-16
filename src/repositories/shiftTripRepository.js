import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'

const atomic = async (stores, writer) => {
  const db = await initializeCanonicalStorage()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores, 'pending_mutations', 'audit_history'], 'readwrite')
    const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
    try { writer(tx, mutations, audit) } catch (error) { reject(error); try { tx.abort() } catch (_) {}; return }
    tx.oncomplete = () => { notifyCanonicalDataChanged({ stores, reason: 'shift-trip:mutation' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Lifecycle persistence failed.')); tx.onabort = () => reject(tx.error || new Error('Lifecycle transaction aborted.'))
  })
}
const saveMutation = (mutationStore, auditStore, entityId, entityType, action, payload, createdAt) => writeMutationAndAudit(mutationStore, auditStore, { entityId, entityType, action, payload, createdAt })
const readAll = async storeName => { const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => { const tx = db.transaction([storeName], 'readonly'); const request = tx.objectStore(storeName).getAll(); request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error || new Error(`${storeName} query failed.`)) }) }
const applyTripCorrection = (trip, data, now) => { if (data.operator !== undefined) trip.operator = data.operator; if (data.tripKm !== undefined) { trip.tripKm = data.tripKm; trip.tripKmAuthority = 'MANUAL' }; if (data.revenue !== undefined) { trip.revenue = data.revenue; trip.revenueAuthority = 'MANUAL' }; trip.updatedAt = now; return trip }

export const ShiftTripRepository = {
  async createShift(data) { const now = new Date().toISOString(); const record = { id: data.id || generateUUID(), startOdometer: Number(data.startOdometer), openingPersonalKm: Number(data.openingPersonalKm || 0), openingDeadKm: Number(data.openingDeadKm || 0), openingPersonalToll: Number(data.openingPersonalToll || 0), openingPersonalParking: Number(data.openingPersonalParking || 0), endOdometer: null, totalDistance: 0, revenue: 0, toll: 0, parking: 0, tollParkingRevenueTreatment: 'NONE', shiftStartAt: data.shiftStartAt || now, shiftEndAt: null, status: 'ACTIVE', createdAt: now, updatedAt: now }; await atomic(['shifts'], (_, m, a) => { _.objectStore('shifts').put(record); saveMutation(m, a, record.id, 'SHIFT', 'CREATE', record, now) }); return record },
  async completeShift(data) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips', 'pending_mutations', 'audit_history'], 'readwrite'); const shifts = tx.objectStore('shifts'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const shiftRequest = shifts.get(data.id)
      shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift) { try { tx.abort() } catch (_) {}; reject(new Error('Active shift not found.')); return }; if (shift.status !== 'ACTIVE') { try { tx.abort() } catch (_) {}; reject(new Error('Shift is not active.')); return }; const now = new Date().toISOString(); const correctionById = new Map((data.trips || []).filter(item => item?.id).map(item => [item.id, item])); const completedTripsRequest = trips.getAll(); completedTripsRequest.onsuccess = () => { try { const completedTrips = (completedTripsRequest.result || []).filter(trip => trip.shiftId === shift.id && trip.status === 'COMPLETED'); for (const trip of completedTrips) { const correction = correctionById.get(trip.id); if (!correction) continue; const updatedTrip = applyTripCorrection(trip, correction, now); trips.put(updatedTrip); saveMutation(mutations, audit, updatedTrip.id, 'TRIP', 'UPDATE', updatedTrip, now) } shift.endOdometer = Number(data.endOdometer); shift.totalDistance = shift.endOdometer - shift.startOdometer; shift.revenue = Number(data.revenue || 0); shift.toll = Number(data.toll || 0); shift.parking = Number(data.parking || 0); shift.tollParkingRevenueTreatment = data.tollParkingRevenueTreatment || 'NONE'; shift.shiftEndAt = now; shift.status = 'COMPLETED'; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) } catch (error) { try { tx.abort() } catch (_) {}; reject(error) } }; completedTripsRequest.onerror = () => { const error = completedTripsRequest.error || new Error('Trip correction lookup failed.'); try { tx.abort() } catch (_) {}; reject(error) } }
      shiftRequest.onerror = () => reject(shiftRequest.error || new Error('Active shift lookup failed.')); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['shifts', 'trips'], reason: 'shift-trip:completeShift' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Atomic shift completion failed.')); tx.onabort = () => reject(tx.error || new Error('Atomic shift completion aborted.'))
    })
  },
  async createTrip(data) { const now = new Date().toISOString(); const record = { id: data.id || generateUUID(), shiftId: data.shiftId, operator: data.operator, tripStartAt: data.tripStartAt || now, tripEndAt: null, status: 'ACTIVE', tripStartLocation: data.tripStartLocation || null, tripEndLocation: null, tripKm: null, tripKmAuthority: 'ESTIMATE', revenue: null, revenueAuthority: 'ESTIMATE', cancelledRevenue: null, cancelReason: null, createdAt: now, updatedAt: now }; await atomic(['trips'], (_, m, a) => { _.objectStore('trips').put(record); saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now) }); return record },
  async completeTrip(data) { return this._finishTrip(data, 'COMPLETED') },
  async cancelTrip(data) { return this._finishTrip(data, 'CANCELLED') },
  async _finishTrip(data, status) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'ACTIVE') { reject(new Error('Trip is not active.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); if (status === 'CANCELLED') { const cancelledRevenue = data.revenue === undefined || data.revenue === '' ? null : Number(data.revenue); if (cancelledRevenue !== null && (!Number.isFinite(cancelledRevenue) || cancelledRevenue < 0)) { reject(new Error('Cancelled trip revenue must be a non-negative number.')); try { tx.abort() } catch (_) {}; return }; record.cancelledRevenue = cancelledRevenue; record.cancelReason = data.reason || 'DRIVER_MISTAKE'; record.revenue = cancelledRevenue; record.revenueAuthority = cancelledRevenue === null ? 'ESTIMATE' : 'MANUAL' }; record.tripEndAt = data.tripEndAt || now; record.status = status; record.tripEndLocation = data.tripEndLocation || null; record.updatedAt = now; trips.put(record); saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now) }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: `trip:${status}` }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip update failed.')); tx.onabort = () => reject(tx.error || new Error('Trip update aborted.'))
    })
  },
  async updateTrip(data) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'COMPLETED') { reject(new Error('Only completed trips can be corrected.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); applyTripCorrection(record, data, now); trips.put(record); saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now) }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:UPDATE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip correction failed.')); tx.onabort = () => reject(tx.error || new Error('Trip correction aborted.'))
    })
  },
  async getAllShifts() { return readAll('shifts') },
  async getTripsForShift(shiftId) { const trips = await readAll('trips'); return trips.filter(t => t.shiftId === shiftId).sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt)) },
  async getAllTrips() { return readAll('trips') },
  async getCompletedTripsForShift(shiftId) { const trips = await this.getTripsForShift(shiftId); return trips.filter(t => t.status === 'COMPLETED') },
  async getLastCompletedShift() { const shifts = await readAll('shifts'); return shifts.filter(s => s.status === 'COMPLETED' && Number.isFinite(Number(s.endOdometer))).sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt))[0] || null },
  async getLastCompletedTrip() { const trips = await readAll('trips'); return trips.filter(t => t.status === 'COMPLETED' && t.operator).sort((a, b) => new Date(b.tripEndAt || b.updatedAt) - new Date(a.tripEndAt || a.updatedAt))[0] || null },
  async getActive() { const [shifts, trips] = await Promise.all([readAll('shifts'), readAll('trips')]); return { shift: shifts.find(s => s.status === 'ACTIVE') || null, trip: trips.find(t => t.status === 'ACTIVE') || null } }
}
