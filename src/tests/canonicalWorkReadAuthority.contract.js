import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const repository = read('../repositories/shiftTripRepository.js')
const service = read('../application/work/workService.js')
const recovery = read('../application/work/canonicalWorkRecovery.js')
const store = read('../stores/shiftTrip.js')
const view = read('../views/WorkModuleView.vue')
const overlay = read('../../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const nativeGps = read('../infrastructure/android/nativeGpsService.js')
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
assert.ok(overlay.includes('refreshCanonicalRevenue'))
assert.ok(overlay.includes('Canonical shift revenue projection was not acknowledged'))

// Android background/screen-off GPS is not silently replaced by browser tracking.
assert.ok(service.includes("const isAndroidRuntime = () => { try { return WorkRuntimePorts.platform.getPlatform() === 'android'"))
assert.ok(service.includes('if (started || isAndroidRuntime())'))
assert.ok(service.includes('not substituting PWA tracking'))
assert.ok(service.includes('WorkRuntimePorts.movementTrace.start'))
assert.ok(overlay.includes('ContextCompat.startForegroundService'))
assert.ok(nativeGps.includes("Capacitor.getPlatform() === 'android'"))
assert.ok(nativeGps.includes("registerPlugin('KfeNativeGps')"))

console.log('PASS: direct canonical reads, pre-write reconciliation, revenue read-model wiring, and native/PWA GPS boundary')
