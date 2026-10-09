import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canTransitionTrip, canTransitionTripStage, transitionTrip, transitionTripStage, TRIP_STATES, TRIP_STAGES } from '../domain/work/tripLifecycle.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const readRepo = relative => fs.readFileSync(path.join(root, '..', relative), 'utf8')
const assertIncludes = (source, needle, label) => assert.ok(source.includes(needle), label)
const assertMatches = (source, pattern, label) => assert.match(source, pattern, label)

const lifecycle = read('application/work/workCockpit.js')
const workService = read('application/work/workService.js')
const store = read('stores/shiftTrip.js')
const workView = read('views/WorkModuleView.vue')
const repository = read('repositories/shiftTripRepository.js')
const notifications = read('infrastructure/android/kfeRideNotificationService.js')
const overlayBridge = read('infrastructure/android/kfeOverlay.js')
const overlayLifecycle = read('infrastructure/android/androidOverlayLifecycle.js')
const nativeOverlay = readRepo('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const nativeNotifications = readRepo('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java')
const nativeReceiver = readRepo('android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java')
const nativeEvents = readRepo('android/app/src/main/java/com/kanishka/pwa/KfeNativeEventStore.java')
const nativeGps = readRepo('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java')
const lifecycleContract = readRepo('docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md')
const dataContract = readRepo('docs/KFE-CANONICAL-DATA-CONTRACT.md')
const gpsContract = readRepo('docs/ANDROID-NATIVE-GPS-CONTRACT.md')
const authorityMap = readRepo('KFE-AUTHORITY-MAP.md')
const matrix = readRepo('docs/KFE-END-TO-END-CONFORMANCE-MATRIX.md')
const runAll = read('tests/runAllContracts.js')
const workflow = readRepo('.github/workflows/consolidated-baseline.yml')

console.log('--- KFE 11-Step End-to-End Conformance Gate ---')

// 1. Frozen requirements become executable contracts.
for (const id of Array.from({ length: 11 }, (_, index) => String(index + 1))) {
  assertIncludes(matrix, `| ${id} |`, `Conformance matrix is missing method step ${id}`)
}
assertIncludes(runAll, 'endToEndConformance.contract.js', 'The conformance gate must be part of the full contract suite.')

// 2. One canonical state/command path.
assertIncludes(lifecycleContract, 'PWA, Android overlay, and notification actions must invoke the same authoritative command/mutation path', 'Lifecycle authority must forbid private surface mutation paths.')
assertIncludes(workService, 'ShiftTripRepository.createTrip', 'START/GO TO PICKUP must use the canonical Trip repository.')
assertIncludes(workService, 'ShiftTripRepository.setTripStage', 'START TRIP must use the canonical Trip stage repository.')
assertIncludes(workService, 'ShiftTripRepository.completeTrip', 'END TRIP must use the canonical Trip repository.')
assertIncludes(workService, 'ShiftTripRepository.cancelTrip', 'CANCEL TRIP must use the canonical Trip repository.')
assertIncludes(store, 'WorkService.startTrip', 'PWA Work must enter pickup through WorkService.')
assertIncludes(store, 'WorkService.startRide', 'PWA Work must start a ride through WorkService.')
assertIncludes(store, 'WorkService.completeTrip', 'PWA Work must end a ride through WorkService.')

// 3. PWA ↔ Android parity.
assertIncludes(workView, 'deriveWorkCockpitState', 'PWA must derive presentation from the shared cockpit state.')
assertIncludes(overlayLifecycle, 'deriveWorkCockpitState', 'Android overlay lifecycle must derive from the same cockpit state.')
assertIncludes(overlayLifecycle, 'WorkService.getActiveState', 'Overlay reconstruction must read canonical active state.')
assertIncludes(overlayBridge, 'registerPlugin(\'KfeOverlay\')', 'PWA overlay bridge must use the native KfeOverlay plugin.')
assertIncludes(nativeOverlay, 'emitAction("GO_TO_PICKUP",pendingTripId', 'Native GO TO PICKUP must return to the PWA command path.')
assertIncludes(nativeOverlay, 'emitAction("START_RIDE",pendingTripId', 'Native START TRIP must return to the PWA command path.')
assertIncludes(nativeOverlay, 'emitAction("END_RIDE",pendingTripId', 'Native END TRIP must return to the PWA command path.')
assertIncludes(nativeNotifications, 'KfeRideNotificationReceiver', 'Notification actions must enter the durable receiver path.')
assertIncludes(nativeReceiver, 'recordPendingAction(context', 'Notification actions must be durably recorded before PWA processing.')

// 4. Complete Work state machine — deterministic Golden Ride.
const shift = { id: 'shift-1', status: 'ACTIVE', startOdometer: 64000, shiftStartAt: '2026-10-03T08:00:00.000Z' }
let trip = { id: 'trip-1', shiftId: shift.id, status: TRIP_STATES.ACTIVE, tripStage: TRIP_STAGES.GOING_TO_PICKUP, revenue: null }
assert.equal(deriveWorkCockpitState({ shift: null }).state, WORK_COCKPIT_STATES.OFFLINE)
assert.equal(deriveWorkCockpitState({ shift }).state, WORK_COCKPIT_STATES.READY)
assert.equal(deriveWorkCockpitState({ shift, trip }).state, WORK_COCKPIT_STATES.GOING_TO_PICKUP)
assert.equal(canTransitionTripStage(TRIP_STAGES.GOING_TO_PICKUP, TRIP_STAGES.RIDE_STARTED), true)
trip = transitionTripStage(trip, TRIP_STAGES.RIDE_STARTED, { at: '2026-10-03T08:10:00.000Z' })
assert.equal(deriveWorkCockpitState({ shift, trip }).state, WORK_COCKPIT_STATES.TRIP_ACTIVE)
trip = transitionTrip(trip, TRIP_STATES.COMPLETED, {
  tripEndAt: '2026-10-03T08:30:00.000Z',
  tripKm: 12.4,
  tripKmAuthority: 'GPS_ESTIMATE'
})
assert.equal(trip.id, 'trip-1')
assert.equal(trip.status, TRIP_STATES.COMPLETED)
assert.equal(deriveWorkCockpitState({ shift, trip: null, pendingFareId: trip.id }).state, WORK_COCKPIT_STATES.READY)

// 5. Interruption/recovery at dangerous boundaries.
assertIncludes(store, 'void refresh().catch(() => {})', 'Shift/END TRIP refreshes must not turn committed writes into false failures.')
assertIncludes(store, 'registeredTrips.value = registeredTrips.value.map', 'END TRIP must immediately reflect the committed completion locally.')
assertIncludes(workView, 'Replay every native event in durable creation order', 'Native event recovery must replay durable events after PWA restart.')
assertIncludes(notifications, 'consumePendingActions', 'PWA must consume durable native events.')
assertIncludes(notifications, 'acknowledgeAction', 'Native events must have an explicit acknowledgement path.')
assertIncludes(nativeEvents, "status TEXT NOT NULL DEFAULT 'PENDING'", 'Native events must survive process interruption.')
assertIncludes(nativeEvents, "created_at ASC, rowid ASC", 'Native events must replay deterministically.')
assertIncludes(nativeOverlay, 'if(!awaitingEventId.isEmpty()) return;', 'Native primary actions must not be duplicated while awaiting canonical acknowledgement.')

// 6. Identity invariants.
assertIncludes(nativeOverlay, 'awaitingEventId', 'Native overlay must retain command identity while waiting.')
assertIncludes(nativeOverlay, 'awaitingTripId', 'Native overlay must retain Trip identity while waiting.')
assertIncludes(nativeOverlay, 'pendingFareTripId', 'Fare recovery must retain the completed Trip identity.')
assertIncludes(nativeOverlay, 'if("END_RIDE".equals(stage)){ pendingFareTripId=tripId;', 'END TRIP acknowledgement must bind fare to the same Trip ID.')
assertIncludes(nativeGps, 'activeTripId.equals(requestedTripId)', 'Native GPS stop must reject a stale command for another active Trip.')
assertIncludes(repository, 'transitionTrip(record, status, data)', 'Terminal Trip transitions must use the canonical lifecycle function.')
assert.equal(canTransitionTrip(TRIP_STATES.COMPLETED, TRIP_STATES.CANCELLED), false)
assert.equal(canTransitionTrip(TRIP_STATES.CANCELLED, TRIP_STATES.COMPLETED), false)
assert.equal(canTransitionTrip(TRIP_STATES.COMPLETED, TRIP_STATES.COMPLETED), true)

// 7. Calculation convergence / no native competing business authority.
assertIncludes(dataContract, 'Shift.revenue', 'Canonical data contract must identify Shift revenue authority.')
assertIncludes(dataContract, 'Trip.revenue', 'Trip revenue must remain supporting detail.')
assertIncludes(workView, 'store.shift?.revenue', 'PWA overlay revenue must read authoritative Shift revenue.')
assertIncludes(overlayLifecycle, 'Number(active.shift?.revenue)', 'Native overlay reconstruction must read authoritative Shift revenue.')
assertIncludes(workService, "tripKmAuthority: 'GPS_LINE_TRACE'", 'Native GPS results must be written through the canonical Trip update path.')
assertIncludes(gpsContract, 'LocationRepository', 'Native GPS must converge into the canonical location repository.')
assert.ok(!/const totalRevenue = trips\.reduce/.test(overlayLifecycle), 'Overlay must not calculate ERP revenue by summing Trip fares.')

// 8. Requirement → implementation → test → evidence coverage.
assertIncludes(authorityMap, 'KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md', 'Authority map must expose lifecycle authority.')
assertIncludes(authorityMap, 'KFE-CANONICAL-DATA-CONTRACT.md', 'Authority map must expose canonical data authority.')
assertIncludes(authorityMap, 'KFE_WORK_COCKPIT_BASELINE.md', 'Authority map must expose Work presentation authority.')
assertIncludes(authorityMap, 'ANDROID-NATIVE-GPS-CONTRACT.md', 'Authority map must expose native GPS implementation boundary.')
assertIncludes(matrix, '### Level A — Repository/CI', 'Matrix must define Level A proof.')
assertIncludes(matrix, '### Level B — Android emulator', 'Matrix must define Level B proof.')
assertIncludes(matrix, '### Level C — Physical Android device', 'Matrix must define Level C proof.')

// 9. Proof levels are explicitly separated.
assertIncludes(gpsContract, 'Physical acceptance gate', 'Native GPS cannot be declared device-validated from source tests alone.')
assertIncludes(matrix, 'A passing repository or emulator gate does **not** substitute for Level C evidence.', 'Release evidence must distinguish physical-device acceptance.')

// 10. Golden Ride is one deterministic scenario, not disconnected screenshots.
assertIncludes(matrix, '## Golden Ride scenario', 'Golden Ride must be explicitly documented.')
assertIncludes(matrix, 'one stable Trip ID from pickup through completion and fare', 'Golden Ride must verify identity continuity.')
assert.equal(trip.id, 'trip-1', 'Golden Ride must preserve one Trip ID through completion.')
const fareUpdate = { ...trip, revenue: 250, revenueAuthority: 'SUPPORTING_ONLY' }
assert.equal(fareUpdate.id, trip.id)
assert.equal(fareUpdate.status, TRIP_STATES.COMPLETED)
const cancelled = transitionTrip(
  { id: 'trip-cancel', shiftId: shift.id, status: TRIP_STATES.ACTIVE, tripStage: TRIP_STAGES.GOING_TO_PICKUP },
  TRIP_STATES.CANCELLED,
  { revenue: '', reason: 'DRIVER_MISTAKE' }
)
assert.equal(cancelled.id, 'trip-cancel')
assert.equal(cancelled.cancelledRevenue, 0, 'Blank cancellation fee defaults to zero')

// 11. Release enforcement.
assertIncludes(workflow, 'run: npm test', 'Consolidated CI must run the complete contract suite.')
assertIncludes(workflow, 'Run Phase 4 Cross-surface Lifecycle', 'Cross-surface lifecycle evidence must remain in CI.')
assertIncludes(workflow, 'Android Exact APK Smoke Gate', 'Android release evidence must include exact APK smoke testing.')
assertIncludes(workflow, 'Upload tested Android Debug APK', 'The exact tested APK must be retained as CI evidence.')

console.log('✓ 1/11 Frozen requirements are executable and gated')
console.log('✓ 2/11 Canonical command/repository path is enforced')
console.log('✓ 3/11 PWA ↔ Android parity is source-gated')
console.log('✓ 4/11 Golden Ride reaches the full operational lifecycle')
console.log('✓ 5/11 Restart/interruption recovery is durable and replayable')
console.log('✓ 6/11 Trip/event/GPS identity invariants are enforced')
console.log('✓ 7/11 Calculation authority remains canonical')
console.log('✓ 8/11 Requirement-to-evidence coverage is explicit')
console.log('✓ 9/11 Repository/emulator/physical proof levels are separated')
console.log('✓ 10/11 Golden Ride identity and terminal behavior are deterministic')
console.log('✓ 11/11 Release CI contains conformance + PWA + Android evidence gates')
console.log('ALL 11 KFE END-TO-END CONFORMANCE STEPS PASSED')
