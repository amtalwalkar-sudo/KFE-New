import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const repository = read('../repositories/shiftTripRepository.js')
const service = read('../application/work/workService.js')
const recovery = read('../application/work/canonicalWorkRecovery.js')
const store = read('../stores/shiftTrip.js')
const view = read('../views/WorkModuleView.vue')
const overlay = read('../../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const revenue = read('../domain/work/liveRevenue.js')
const { deriveLiveRevenue } = await import('../domain/work/liveRevenue.js')

for (const snippet of [
  "async getAllShifts({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary();",
  "async getTripsForShift(shiftId, { skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary();",
  "async getAllTrips({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary();",
  "async getLastCompletedShift() { await ensureCanonicalReadBoundary();",
  "async getLastCompletedTrip() { await ensureCanonicalReadBoundary();",
  "async getActive({ skipCanonicalReadBoundary = false } = {}) { if (!skipCanonicalReadBoundary) await ensureCanonicalReadBoundary();",
]) assert.ok(repository.includes(snippet), 'missing canonical read boundary: ' + snippet)

for (const snippet of [
  "async createShift(data) { await ensureCanonicalReadBoundary();",
  "async completeShift(data) { await ensureCanonicalReadBoundary();",
  "async createTrip(data) { await ensureCanonicalReadBoundary();",
  "async setTripStage(id, stage) { await ensureCanonicalReadBoundary();",
  "async _finishTrip(data, status) { await ensureCanonicalReadBoundary();",
  "async updateTrip(data) { await ensureCanonicalReadBoundary();",
]) assert.ok(repository.includes(snippet), 'missing pre-write canonical reconciliation: ' + snippet)

assert.ok(!repository.includes('../application/'), 'repository must not depend on application-layer modules')
assert.ok(service.includes('configureCanonicalReadBoundary(reconcileCanonicalReads)'))
assert.ok(repository.includes('outcome?.accepted !== true') === false, 'native acknowledgement check belongs to the injected application boundary')
assert.ok(service.includes('outcome?.accepted !== true'), 'native write acknowledgement must be required')
assert.ok(service.includes('markCanonicalSyncPending'), 'a durable pending operation must be journaled before crossing the native bridge')
assert.ok(service.includes('clearCanonicalSyncPending'), 'the pending journal must clear only after acknowledgement')
const nativeStore = read('../../android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java')
assert.ok(nativeStore.includes('refreshShiftRevenueProjection(db, record.optString("shiftId", ""), now)'), 'native trip mirrors must atomically refresh the owning shift revenue projection')
assert.ok(nativeStore.includes('private void refreshShiftRevenueProjection(SQLiteDatabase db, String shiftId, String now)'), 'native shift revenue must derive from canonical trip records')
assert.ok(nativeStore.includes('"COMPLETED".equals(status) && !item.optBoolean("fareDetailsSkipped", false)'), 'native projection must exclude skipped fares')
assert.ok(nativeStore.includes('"CANCELLED".equals(status)'), 'native projection must include cancellation fees')
assert.ok(nativeStore.includes('latest.plusMillis(1).toString()'), 'native projection must advance the shift version monotonically')
assert.ok(!service.includes('mirrorCanonicalShiftByTripId'), 'trip writes must not race a redundant full SHIFT mirror against native revenue projection')
assert.ok(service.includes('await mirrorCanonicalTripById(data?.id)'), 'trip completion/cancellation must mirror the trip and let SQLite derive shift revenue')
assert.ok(service.includes('existingPending?.fingerprint === fingerprint'), 'retries must reuse the operation ID only for the same payload')
assert.ok(service.includes("includes('Local canonical record changed before native mirror')"), 'concurrent local mutations must retry from the latest stored payload')
assert.ok(repository.includes('current._nativeCanonicalSync.fingerprint !== fingerprint'), 'pending operation cleanup is guarded by operation identity and payload fingerprint')
assert.ok(repository.includes('Local canonical record changed before native mirror'), 'concurrent local edits must not be journaled against an older snapshot')

assert.ok(service.includes('Native canonical ' + '${entityType}' + ' commit was not acknowledged.'))
assert.ok(recovery.includes('canonicalIds.has(local.id) && !hasPendingNativeWrite'), 'only explicitly journaled pending writes may retry against existing native records')
assert.ok(recovery.includes('await mirrorRecord(entityType, local)'), 'local-only records may recover an interrupted first mirror')
assert.ok(repository.includes('if (canonicalRecord?.id) store.put(writeRecord)'), 'native canonical snapshots must replace stale IndexedDB records regardless of updatedAt')
assert.ok(!repository.includes('if (order < 0) return // Never replace a newer local write with an older snapshot.'), 'local updatedAt must not outrank native canonical authority')
assert.ok(recovery.includes('await syncCanonicalRecords({ shifts: refreshed.shifts.records, trips: refreshed.trips.records })'))
assert.ok(store.includes('registeredTrips.value = await WorkService.getTripsForShift'))
assert.ok(view.includes('deriveLiveRevenue(store.registeredTrips.filter'))
assert.ok(revenue.includes('deriveLiveRevenue'))
assert.equal(deriveLiveRevenue([{ status: 'COMPLETED', revenue: 250 }, { status: 'COMPLETED', revenue: 150 }]), 400)
assert.ok(overlay.includes('canonical.commitTripForm(operationId,mode,trip)'))
assert.ok(overlay.includes('Canonical trip form was not accepted'))
assert.ok(!overlay.includes('refreshCanonicalRevenue'), 'Fare/cancellation must not use a second non-atomic revenue projection.')
assert.ok(overlay.includes('Canonical trip form was not accepted'))

assert.ok(service.includes('ShiftTripRepository.createTrip') && service.includes('ShiftTripRepository.setTripStage') && service.includes('ShiftTripRepository.completeTrip') && service.includes('ShiftTripRepository.cancelTrip'), 'PWA lifecycle remains on canonical repository paths')
assert.match(service, /captureAndPersistEventLocation\('TRIP'/, 'PWA trip lifecycle must use the shared event-location pathway.')
assert.match(overlay, /captureOneShotEventLocation/, 'Native overlay location capture must use the shared event pathway.')
assert.doesNotMatch(service + view + overlay, /nativeGps|MovementTraceService|captureLifecycleLocation|ValhallaRoutingAdapter|routeTrace|requestLocationUpdates/)

const endShiftImplementation = service.slice(service.indexOf('async endShift(data)'), service.indexOf('async recordFuel(data)'))
assert.ok(endShiftImplementation.includes('readNativeWorkSnapshot()'), 'Android shift closure must prepare from SQLite canonical records')
assert.ok(endShiftImplementation.includes("await commitNativeFirst('SHIFT', completedShift, { expectedUpdatedAt: shift.updatedAt })"), 'Android shift closure must commit to SQLite before refreshing IndexedDB')
assert.ok(endShiftImplementation.indexOf("await commitNativeFirst('SHIFT', completedShift, { expectedUpdatedAt: shift.updatedAt })") < endShiftImplementation.indexOf('checkpoint()'), 'shift closure must be committed before post-commit work')
assert.ok(endShiftImplementation.includes("if (activeTrip) return { ok: false, reason: 'ACTIVE_TRIP_IN_PROGRESS' }"), 'native shift closure must refuse to close while a canonical trip is active')
assert.ok(service.includes("const record = createNativeShiftRecord(data); return await commitPreparedCreateIntent('SHIFT', record, data)"), 'Android shift creation must journal intent and commit native first')
assert.ok(service.includes("const record = createNativeTripRecord(tripData); return await commitPreparedCreateIntent('TRIP', record, tripData)"), 'Android trip creation must journal intent and commit native first')
assert.ok(service.includes("transitionTripStage(trip, 'RIDE_STARTED'"), 'Android ride-stage transition must be prepared from native canonical state')
assert.ok(service.includes("await commitNativeFirst('TRIP', next, { expectedUpdatedAt: trip.updatedAt })"), 'Android trip lifecycle changes must commit native first')
assert.ok(service.includes('await ShiftTripRepository.syncCanonicalRecords(snapshot)'), 'IndexedDB must refresh after native write acknowledgement')
assert.ok(service.includes('const operationId = `pwa-\u0024{entityType.toLowerCase()}-\u0024{record.id}-\u0024{record.updatedAt}`'), 'operation id must be deterministic for the same record version')

console.log('PASS: canonical read/write recovery, native-first Android lifecycle ordering, revenue read-model wiring, and GPS-free native/PWA lifecycle')
