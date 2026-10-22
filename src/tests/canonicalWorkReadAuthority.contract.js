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
assert.match(service, /captureTripBoundaryLocation/)
assert.match(overlay, /captureOneShotTripBoundary/)
assert.doesNotMatch(service + view + overlay, /nativeGps|MovementTraceService|captureLifecycleLocation|ValhallaRoutingAdapter|routeTrace|requestLocationUpdates/)

const endShiftImplementation = service.slice(service.indexOf('async endShift(data)'), service.indexOf('async recordFuel(data)'))
assert.ok(endShiftImplementation.includes('getAllShifts({ skipCanonicalReadBoundary: true })'), 'end-shift native mirroring must read the just-completed local shift without triggering recovery')
assert.ok(!endShiftImplementation.includes('getLastCompletedShift()'), 'end-shift must not reconcile a stale native ACTIVE snapshot before mirroring COMPLETED')
assert.ok(endShiftImplementation.indexOf("await mirrorCanonicalRecord('SHIFT', closedShift)") < endShiftImplementation.indexOf('getTripsForShift(active.shift.id, { skipCanonicalReadBoundary: true })'), 'the completed shift must reach native canonical storage before further local trip reads')
assert.ok(endShiftImplementation.includes('if (result?.ok && active.shift?.id && nativeCanonicalAvailable())'), 'native completion mirroring must run only after a successful PWA shift completion')
assert.ok(endShiftImplementation.includes('CanonicalWorkBoundary.createOperationId()'), 'native mirror identity must be created before the local shift-completion transaction')
assert.ok(endShiftImplementation.includes('canonicalSyncOperationId } : {})'), 'the same native operation identity must flow into the shift-completion transaction')

const completeShiftImplementation = repository.slice(repository.indexOf('async completeShift(data)'), repository.indexOf('async createTrip(data)'))
assert.ok(completeShiftImplementation.includes('const canonicalSyncOperationId = String(data.canonicalSyncOperationId || \'\').trim()'), 'native shift completion must accept the pre-created mirror identity')
assert.ok(completeShiftImplementation.includes('_nativeCanonicalSync: {'), 'the completed shift must carry a durable pending native-mirror marker')
assert.ok(completeShiftImplementation.includes('fingerprint: JSON.stringify(stableRecordValue(shift))'), 'the pending marker must fingerprint the exact completed business payload')
assert.ok(completeShiftImplementation.indexOf('const writeRecord = canonicalSyncOperationId') < completeShiftImplementation.indexOf('shifts.put(writeRecord)'), 'the pending mirror marker must be written in the same transaction as shift completion')
assert.ok(completeShiftImplementation.includes("saveMutation(mutations, audit, shift.id, 'SHIFT', 'UPDATE', shift, now)"), 'audit/mutation payload must not leak internal mirror metadata')

console.log('PASS: canonical read/write recovery, atomic end-shift mirror journaling, end-shift mirror ordering, revenue read-model wiring, and GPS-free native/PWA lifecycle')
