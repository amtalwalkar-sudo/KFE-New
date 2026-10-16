import assert from 'node:assert/strict'
import fs from 'node:fs'

const repository = fs.readFileSync(new URL('../repositories/shiftTripRepository.js', import.meta.url), 'utf8')
const service = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
const recovery = fs.readFileSync(new URL('../application/work/canonicalWorkRecovery.js', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../stores/shiftTrip.js', import.meta.url), 'utf8')
const view = fs.readFileSync(new URL('../views/WorkModuleView.vue', import.meta.url), 'utf8')
const overlay = fs.readFileSync(new URL('../../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', import.meta.url), 'utf8')
const revenue = fs.readFileSync(new URL('../domain/work/liveRevenue.js', import.meta.url), 'utf8')

// Direct repository reads—not just startup—must cross the same native authority
// boundary before they can feed history, fare forms, timers, or calculations.
for (const method of [
  'getAllShifts', 'getTripsForShift', 'getAllTrips',
  'getLastCompletedShift', 'getLastCompletedTrip', 'getActive',
]) {
  const match = repository.match(new RegExp('async ' + method + '\\([^)]*\\) \\{([^}]+)\\}'))
  assert.ok(match, `expected repository read method ${method}`)
  assert.match(match[1], /ensureCanonicalReadBoundary\\(\\)/, `${method} must reconcile canonical records before returning`)
}
for (const method of ['createShift', 'completeShift', 'createTrip', 'setTripStage', '_finishTrip', 'updateTrip']) {
  const match = repository.match(new RegExp('async ' + method + '\\([^)]*\\) \\{([^;]+);'))
  assert.ok(match, `expected lifecycle/fare writer ${method}`)
  assert.match(match[1], /ensureCanonicalReadBoundary\\(\\)/, `${method} must reconcile before deriving or mutating state`)
}
assert.match(repository, /outcome\?\.accepted !== true/)
assert.match(repository, /Native canonical \\${entityType\\} commit was not acknowledged/)
assert.match(recovery, /await mirrorRecord\\(entityType, local\\)/)
assert.match(recovery, /await syncCanonicalRecords\\(\{ shifts: refreshed\.shifts\.records, trips: refreshed\.trips\.records \}\)/)
assert.match(store, /registeredTrips\.value = await WorkService\.getTripsForShift/)
assert.match(view, /deriveLiveRevenue\\(store\.registeredTrips\.filter/)
assert.match(revenue, /export function deriveLiveRevenue|export const deriveLiveRevenue/)

// Android background/screen-off GPS is not silently replaced by browser tracking.
// The PWA path remains a separate foreground geolocation capability.
assert.match(service, /const isAndroidRuntime = \\(\\) => .*getPlatform\\(\\) === 'android'/)
assert.match(service, /if \\(started \\|\\| isAndroidRuntime\\(\\)\\)/)
assert.match(service, /if \\(isAndroidRuntime\\(\\)\\) \\{[\\s\\S]*?not substituting PWA tracking/)
assert.match(service, /WorkRuntimePorts\.movementTrace\.start/)
assert.match(overlay, /ContextCompat\.startForegroundService/)
assert.match(overlay, /private void startNativeGps|NativeGpsService|KfeNativeGps/)

console.log('PASS: canonical read authority covers direct lifecycle/fare reads and calculation inputs; Android background GPS remains separate from PWA tracking')
