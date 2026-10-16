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
  "async getAllShifts() { await ensureCanonicalReadBoundary();",
  "async getTripsForShift(shiftId) { await ensureCanonicalReadBoundary();",
  "async getAllTrips() { await ensureCanonicalReadBoundary();",
  "async getLastCompletedShift() { await ensureCanonicalReadBoundary();",
  "async getLastCompletedTrip() { await ensureCanonicalReadBoundary();",
  "async getActive() { await ensureCanonicalReadBoundary();",
]) assert.ok(repository.includes(snippet), 'missing canonical read boundary: ' + snippet)

for (const snippet of [
  "async createShift(data) { await ensureCanonicalReadBoundary();",
  "async completeShift(data) { await ensureCanonicalReadBoundary();",
  "async createTrip(data) { await ensureCanonicalReadBoundary();",
  "async setTripStage(id, stage) { await ensureCanonicalReadBoundary();",
  "async _finishTrip(data, status) { await ensureCanonicalReadBoundary();",
  "async updateTrip(data) { await ensureCanonicalReadBoundary();",
]) assert.ok(repository.includes(snippet), 'missing pre-write canonical reconciliation: ' + snippet)

assert.ok(repository.includes('outcome?.accepted !== true'), 'native write acknowledgement must be required')
assert.ok(repository.includes('Native canonical ' + '${entityType}' + ' commit was not acknowledged.'))
assert.ok(recovery.includes('await mirrorRecord(entityType, local)'))
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
