import { initializeCanonicalStorage, notifyCanonicalDataChanged } from '../utils/indexedDB.js'
import { generateUUID } from '../utils/uuid.js'
import { writeMutationAndAudit } from './mutationRepository.js'
import { normalizeShiftInput, normalizeTripInput } from '../domain/canonicalNormalization.js'
import { reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
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

export const ShiftTripRepository = {
  async createShift(data) { const normalized = normalizeShiftInput(data); const now = new Date().toISOString(); const startOdometer = requireFinite(normalized.startOdometer, 'startOdometer'); const record = { id: normalized.id || generateUUID(), startOdometer, openingPersonalKm: Number(normalized.openingPersonalKm || 0), openingDeadKm: Number(normalized.openingDeadKm || 0), openingPersonalToll: Number(normalized.openingPersonalToll || 0), openingPersonalParking: Number(normalized.openingPersonalParking || 0), openingBaselineType: normalized.openingBaselineType || 'POST_KFE_GAP', historicalOdometerGapKm: Number(normalized.historicalOdometerGapKm || 0), businessStartDate: normalized.businessStartDate || null, businessStartOdometer: Number.isFinite(Number(normalized.businessStartOdometer)) ? Number(normalized.businessStartOdometer) : null, endOdometer: null, totalDistance: 0, revenue: 0, toll: 0, parking: 0, tollParkingRevenueTreatment: 'INCLUDED', tollParkingCaptureMode: 'ADDITIONAL_ONLY', tollTreatment: normalized.tollTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED', parkingTreatment: normalized.parkingTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED', shiftStartAt: normalized.shiftStartAt || now, shiftEndAt: null, status: 'ACTIVE', createdAt: now, updatedAt: now }; await atomic(['shifts'], (_, m, a) => { _.objectStore('shifts').put(record); saveMutation(m, a, record.id, 'SHIFT', 'CREATE', record, now) }); return record },
  async completeShift(data) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'pending_mutations', 'audit_history'], 'readwrite')
      const shifts = tx.objectStore('shifts')
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
        try {
          const now = new Date().toISOString()
          const normalized = normalizeShiftInput(data)
          shift.endOdometer = requireFinite(normalized.endOdometer, 'endOdometer')
          if (shift.endOdometer < shift.startOdometer) throw new Error('endOdometer cannot be less than startOdometer.')
          shift.totalDistance = shift.endOdometer - shift.startOdometer
          if (data.movementReconciliation) shift.movementReconciliation = data.movementReconciliation
          shift.shiftEndAt = now
          shift.shiftDurationMs = Math.max(0, Date.parse(now) - Date.parse(shift.shiftStartAt || now))
          shift.status = 'COMPLETED'
          shift.updatedAt = now
          shifts.put(shift)
          saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now)
        } catch (error) {
          try { tx.abort() } catch (_) {}
          reject(error)
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
  async createTrip(data) { const normalized = normalizeTripInput(data); if (!normalized.shiftId) throw new Error('shiftId is required for a Trip.'); const now = new Date().toISOString(); const record = { id: normalized.id || generateUUID(), shiftId: normalized.shiftId, operator: normalized.operator, tripStartAt: normalized.tripStartAt || null, tripEndAt: null, status: 'ACTIVE', tripStartLocation: normalized.tripStartLocation || null, tripEndLocation: null, tripKm: normalized.tripKm ?? null, tripKmAuthority: normalized.tripKm !== undefined ? 'MANUAL' : 'ESTIMATE', tripKmProvenance: normalized.tripKmProvenance ?? null, tripStage: normalized.tripStage || 'GOING_TO_PICKUP', toll: normalized.toll ?? 0, parking: normalized.parking ?? 0, tollTreatment: normalized.tollTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED', parkingTreatment: normalized.parkingTreatment || normalized.tollParkingRevenueTreatment || 'INCLUDED', revenue: normalized.revenue ?? null, revenueAuthority: normalized.revenue !== undefined ? 'SUPPORTING_ONLY' : 'SUPPORTING_ONLY', revenueProvenance: normalized.revenueProvenance ?? null, fareDetailsSkipped: false, cancelledRevenue: null, cancelReason: null, createdAt: now, updatedAt: now }; await atomic(['trips'], (_, m, a) => { _.objectStore('trips').put(record); saveMutation(m, a, record.id, 'TRIP', 'CREATE', record, now) }); return record },
  async setTripStartLocation(id, location) {
    return this._setTripLocation(id, location, 'tripStartLocation')
  },
  async setTripStage(id, stage) {
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
  async enrichTripMovement(data) {
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const trips = tx.objectStore('trips'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history')
      const request = trips.get(data.id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || record.status !== 'COMPLETED') { try { tx.abort() } catch (_) {}; resolve(false); return }
        const now = new Date().toISOString()
        if (data.tripKm !== undefined && Number.isFinite(Number(data.tripKm)) && Number(data.tripKm) >= 0) record.tripKm = Number(data.tripKm)
        if (data.tripKmAuthority) record.tripKmAuthority = data.tripKmAuthority
        if (data.tripKmProvenance !== undefined) record.tripKmProvenance = data.tripKmProvenance
        if (data.roadMatchedGeometry !== undefined) record.roadMatchedGeometry = data.roadMatchedGeometry
        if (data.traceGeometry !== undefined) record.traceGeometry = data.traceGeometry
        record.updatedAt = now
        trips.put(record)
        saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now)
      }
      request.onerror = () => reject(request.error || new Error('Trip enrichment lookup failed.'))
      tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:movement-enrichment' }); resolve(true) }
      tx.onerror = () => reject(tx.error || new Error('Trip enrichment failed.'))
      tx.onabort = () => reject(tx.error || new Error('Trip enrichment aborted.'))
    })
  },
  async invalidateGpsTripMovement({ id, reason, traceQuality = {} } = {}) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'pending_mutations', 'audit_history'], 'readwrite')
      const trips = tx.objectStore('trips')
      const mutations = tx.objectStore('pending_mutations')
      const audit = tx.objectStore('audit_history')
      const request = trips.get(id)
      request.onsuccess = () => {
        const record = request.result
        if (!record || record.status !== 'COMPLETED' || !['GPS_LINE_TRACE', 'VALHALLA_ROAD_TRACE'].includes(record.tripKmAuthority)) {
          try { tx.abort() } catch (_) {}
          resolve(false)
          return
        }
        const now = new Date().toISOString()
        record.tripKm = null
        record.tripKmAuthority = 'GPS_TRACE_INCOMPLETE'
        record.tripKmProvenance = {
          ...(record.tripKmProvenance || {}),
          qualityStatus: 'INCOMPLETE',
          qualityReason: reason || traceQuality.reason || 'GPS_TRACE_COVERAGE_UNVERIFIED',
          gpsTracePoints: traceQuality.pointCount ?? record.tripKmProvenance?.gpsTracePoints ?? null,
          maxObservedGapMs: traceQuality.maxObservedGapMs ?? null,
          checkedAt: now
        }
        record.roadMatchedGeometry = null
        record.traceGeometry = []
        record.updatedAt = now
        trips.put(record)
        saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now)
      }
      request.onerror = () => reject(request.error || new Error('Trip GPS quality invalidation lookup failed.'))
      tx.oncomplete = () => {
        notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:gps-trace-incomplete' })
        resolve(true)
      }
      tx.onerror = () => reject(tx.error || new Error('Trip GPS quality invalidation failed.'))
      tx.onabort = () => { if (tx.error) reject(tx.error); else resolve(false) }
    })
  },
  async updateTrip(data) {
    const db = await initializeCanonicalStorage(); return new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'shifts', 'pending_mutations', 'audit_history'], 'readwrite'); const trips = tx.objectStore('trips'); const shifts = tx.objectStore('shifts'); const mutations = tx.objectStore('pending_mutations'); const audit = tx.objectStore('audit_history'); const request = trips.get(data.id)
      request.onsuccess = () => { const record = request.result; if (!record) { reject(new Error('Trip not found.')); try { tx.abort() } catch (_) {}; return }; if (record.status !== 'COMPLETED' && record.status !== 'CANCELLED') { reject(new Error('Only completed or cancelled trips can be corrected.')); try { tx.abort() } catch (_) {}; return }; const now = new Date().toISOString(); applyTripCorrection(record, data, now); trips.put(record); saveMutation(mutations, audit, record.id, 'TRIP', 'UPDATE', record, now); const shiftRequest = shifts.get(record.shiftId); shiftRequest.onsuccess = () => { const shift = shiftRequest.result; if (!shift || shift.status !== 'COMPLETED') return; const allTripsRequest = trips.getAll(); allTripsRequest.onsuccess = () => { const reconciliation = reconcileShiftRevenue({ shiftRevenue: shift.revenue, trips: allTripsRequest.result.filter(trip => trip.shiftId === shift.id), toll: shift.toll, parking: shift.parking, tollTreatment: shift.tollTreatment, parkingTreatment: shift.parkingTreatment, tollParkingCaptureMode: shift.tollParkingCaptureMode, tollParkingRevenueTreatment: shift.tollParkingRevenueTreatment }); shift.revenueReconciliation = reconciliation; shift.updatedAt = now; shifts.put(shift); saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now) }; allTripsRequest.onerror = () => { try { tx.abort() } catch (_) {} } }; shiftRequest.onerror = () => { try { tx.abort() } catch (_) {} } }
      request.onerror = () => reject(request.error); tx.oncomplete = () => { notifyCanonicalDataChanged({ stores: ['trips'], reason: 'trip:UPDATE' }); resolve(true) }; tx.onerror = () => reject(tx.error || new Error('Trip correction failed.')); tx.onabort = () => reject(tx.error || new Error('Trip correction aborted.'))
    })
  },
  async getAllShifts() { return readAll('shifts') },
  async getTripsForShift(shiftId) { const trips = await readAll('trips'); return trips.filter(t => t.shiftId === shiftId).sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt)) },
  async getAllTrips() { return readAll('trips') },
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
  async getLastCompletedShift() { const shifts = await readAll('shifts'); return shifts.filter(s => s.status === 'COMPLETED' && Number.isFinite(Number(s.endOdometer))).sort((a, b) => new Date(b.shiftEndAt || b.updatedAt) - new Date(a.shiftEndAt || a.updatedAt))[0] || null },
  async getLastCompletedTrip() { const trips = await readAll('trips'); return trips.filter(t => t.status === 'COMPLETED' && t.operator).sort((a, b) => new Date(b.tripEndAt || b.updatedAt) - new Date(a.tripEndAt || a.updatedAt))[0] || null },
  async syncCanonicalRecords({ shifts = [], trips = [] } = {}) {
    const db = await initializeCanonicalStorage()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips'], 'readwrite')
      const shiftStore = tx.objectStore('shifts')
      const tripStore = tx.objectStore('trips')
      for (const record of shifts) if (record?.id) shiftStore.put(record)
      for (const record of trips) if (record?.id) tripStore.put(record)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error || new Error('Native canonical recovery failed.'))
      tx.onabort = () => reject(tx.error || new Error('Native canonical recovery aborted.'))
    })
  },
  async getActive() { const [shifts, trips] = await Promise.all([readAll('shifts'), readAll('trips')]); return { shift: shifts.find(s => s.status === 'ACTIVE') || null, trip: trips.find(t => t.status === 'ACTIVE') || null } }
}
