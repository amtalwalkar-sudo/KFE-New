import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'
import { deriveWorkCockpitState, WORK_COCKPIT_STATES } from '../application/work/workCockpit.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { WORK_TRIP_OPERATORS, validateTripOperator, validateTripCorrection, calculateTripRevenueDetail } from '../domain/work/trip.js'
import { calculateFuelQuantity, validateFuelEntry } from '../domain/work/fuel.js'
import { WorkService } from '../application/work/workService.js'
import { WorkflowTimerService, WorkWorkflowSessionService } from '../application/work/workflowTimerService.js'
import { getLiveMovementTracePlan } from '../application/work/liveMovementTrace.js'
import { deriveLiveRevenue } from '../domain/work/liveRevenue.js'
import { filterGpsTrace, routeTrace } from '../domain/movement/movementAccounting.js'
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'COMPLETED',revenue:150}]),400)
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'CANCELLED',cancelledRevenue:75}]),325, 'Shift revenue projection includes eligible completed-trip fares plus cancellation fees.')
assert.equal(deriveLiveRevenue([{status:'CANCELLED',cancelledRevenue:''},{status:'CANCELLED',cancelledRevenue:null}]),0, 'Blank and not-applicable cancellation fees contribute ₹0.')
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:999,fareDetailsSkipped:true},{status:'CANCELLED',cancelledRevenue:25}]),25, 'Skipped completed-trip fare detail is excluded while cancellation fees remain eligible.')
const workViewSource = fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8')
assert.doesNotMatch(workViewSource, /from ['"][^'"]*\/infrastructure\//, 'Work view must not import infrastructure adapters directly.')
assert.doesNotMatch(workViewSource, /from ['"]@capacitor\/core['"]/, 'Work view must not depend directly on Capacitor.')
assert.match(workViewSource, /WorkRuntimePorts\.platform\.getPlatform\(\)/, 'Platform identity must arrive through an application-facing port.')

assert.equal(typeof WorkService.getTripGpsDistanceKm, 'function')
const workServiceSource = fs.readFileSync(path.join(process.cwd(), 'src/application/work/workService.js'), 'utf8')
assert.match(workServiceSource, /getTripGpsDistanceKm[\s\S]*?filterGpsTrace\(snapshots\)/, 'Passenger-ride distance reads must use the filtered derived GPS trace.')
assert.match(workServiceSource, /getTripDeadMovementDistanceKm[\s\S]*?filterGpsTrace\(snapshots\)/, 'Dead-movement distance reads must use the same filtered derived GPS trace.')
const liveMovementFixture = WorkService.calculateLiveMovement([
  { latitude: 19, longitude: 72, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 19.001, longitude: 72, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:00:20.000Z' },
  { latitude: 19.002, longitude: 72, accuracy: 120, speed: 10, capturedAt: '2026-10-01T08:00:40.000Z' }
])
assert.equal(liveMovementFixture.points.length, 2, 'Live movement excludes GPS fixes worse than the canonical 80 m accuracy limit.')
assert.ok(liveMovementFixture.distanceKm > 0, 'Live movement sums filtered GPS segments into a non-zero distance.')

// GPS jitter/outlier regression: speed is supplied in m/s, so it must be converted
// before stationary thresholds; stationary drift and impossible jumps cannot inflate KM.
const noisyGpsTrace = [
  { latitude: 19, longitude: 72, accuracy: 5, speed: 0, capturedAt: '2026-10-01T08:00:00.000Z' },
  { latitude: 19.0001, longitude: 72, accuracy: 5, speed: 0, capturedAt: '2026-10-01T08:00:20.000Z' },
  { latitude: 19.001, longitude: 72, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:00:40.000Z' },
  { latitude: 19.2, longitude: 72, accuracy: 5, speed: 0, capturedAt: '2026-10-01T08:01:00.000Z' },
  { latitude: 19.002, longitude: 72, accuracy: 120, speed: 10, capturedAt: '2026-10-01T08:01:20.000Z' },
  { latitude: 19.0011, longitude: 72, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:01:20.000Z' },
  { latitude: 19.002, longitude: 72, accuracy: 5, speed: 10, capturedAt: '2026-10-01T08:01:20.000Z' }
]
const filteredNoisyTrace = filterGpsTrace(noisyGpsTrace)
assert.equal(filteredNoisyTrace.length, 3, 'Routing trace removes stationary jitter, poor-accuracy fixes, equal-time duplicates and implausible jumps.')
assert.equal(filteredNoisyTrace[0].latitude, 19, 'The stationary anchor is preserved.')
assert.equal(filteredNoisyTrace[1].latitude, 19.001, 'The first plausible movement point is retained.')
assert.equal(filteredNoisyTrace[2].latitude, 19.0011, 'A zero-duration point cannot replace the last accepted point.')
let routedPointCount = 0
const filteredRoute = await routeTrace(noisyGpsTrace, { routeTrace: async points => {
  routedPointCount = points.length
  return { distanceKm: 1.2, geometry: { type: 'LineString', coordinates: [[72, 19], [72, 19.01]] }, method: 'TEST_MAP_MATCH', provider: 'test', provenance: { provider: 'valhalla' } }
} })
assert.equal(routedPointCount, 3, 'Valhalla receives the filtered derived trace, not noisy raw fixes.')
assert.equal(filteredRoute.distanceKm, 1.2, 'A valid map-matched road distance is retained.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /liveMovementLabel = computed\(\(\) => store\.isOnline \? \(active\.value \? 'BUSINESS KM' : 'DEAD KM'\) : ''\)/, 'Live movement labels remain visible throughout an online shift, including between trips.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /const stateTimerLabel = computed\(\(\) =>/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /const stateTimer = computed\(\(\) =>/)
const liveMetricsSource = fs.readFileSync(path.join(process.cwd(), 'src/components/work/WorkLiveMetrics.vue'), 'utf8')
assert.match(workViewSource, /<WorkLiveMetrics/)
assert.match(liveMetricsSource, /work-live-metrics/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /WorkRuntimePorts\.nativeGps.readTrace\(traceOwnerId\)/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /setInterval\(\(\) => \{ void refreshLiveMovementKm\(\).then\(\(\) => syncOverlay\(\)\).catch\(\(\) => \{\}\) \}, 3000\)/)
assert.match(liveMetricsSource, /live-km-readout/)
assert.match(liveMetricsSource, /movementKm\.toFixed\(1\)/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /WorkRuntimePorts\.nativeGps.readTrace\(traceOwnerId\)/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /LIVE GPS ESTIMATE/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /WorkRuntimePorts\.movementTrace.resumePersisted\(savedTrace\)/, 'A persisted browser trace is resumed only after its canonical owner is matched.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /WorkRuntimePorts\.nativeGps.start\(store\.trip\.id, 'PASSENGER_RIDE_TRACE', 'TRIP'\)/, 'Passenger GPS switches to the canonical trip owner when a ride starts.')
assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /ensureDeadMovementCapture\('SHIFT', store\.shift\?\.id\)/, 'GPS must not run under a shift owner while waiting between rides.')
const movementRecoverySource = fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8')
assert.match(movementRecoverySource, /const resumableMovementStage = store\.trip\?\.status === 'ACTIVE' &&[\s\S]*?\['PICKUP', 'GOING_TO_PICKUP', 'RIDE_STARTED'\]\.includes\(store\.trip\?\.tripStage\)/, 'Recovery is gated by an explicitly active pickup or passenger-ride stage, including pickup recovery.')
assert.match(movementRecoverySource, /if \(store\.isOnline && nativeAndroid && resumableMovementStage && recoveryPlan\.entityType === 'TRIP'\) \{\s*await WorkRuntimePorts\.nativeGps\.start\(recoveryPlan\.entityId, recoveryPlan\.eventType, 'TRIP'\)/, 'Native GPS resumes only for the matching active trip trace owner and event type.')
assert.doesNotMatch(movementRecoverySource, /if \(store\.isOnline && nativeAndroid && store\.trip\?\.id/, 'Online status and a stale trip ID alone must never restart GPS.')
assert.doesNotMatch(movementRecoverySource, /store\.isOnline && nativeAndroid && !resumableMovementStage[\s\S]{0,160}nativeGps\.start/, 'GPS remains silent during online waiting and other non-movement stages.')
assert.deepEqual(
  (({ eventType, entityType, profile }) => ({ eventType, entityType, profile }))(getLiveMovementTracePlan({
    shiftId: 'shift-1', trip: { id: 'trip-1', status: 'ACTIVE', tripStage: 'GOING_TO_PICKUP' }
  })),
  { entityType: 'TRIP', eventType: 'DEAD_MOVEMENT_TRACE', profile: 'DEAD_LEG' },
  'GO TO PICKUP assigns GPS movement to dead miles owned by the active trip.'
)
assert.deepEqual(
  (({ eventType, entityType, profile }) => ({ eventType, entityType, profile }))(getLiveMovementTracePlan({
    shiftId: 'shift-1', trip: { id: 'trip-1', status: 'ACTIVE', tripStage: 'RIDE_STARTED' }
  })),
  { entityType: 'TRIP', eventType: 'PASSENGER_RIDE_TRACE', profile: 'PASSENGER_RIDE' },
  'START TRIP assigns GPS movement to business miles owned by the active trip.'
)
assert.match(movementRecoverySource, /const cancelledTripId = store\.trip\?\.id[\s\S]*?await WorkRuntimePorts\.nativeGps\.stop\(cancelledTripId\)[\s\S]*?syncTrace\(cancelledTripId, \{ entityType: 'TRIP' \}\)/, 'CANCEL TRIP stops native GPS and commits its dead-movement trace.')
assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /nativeGps\.start\(nativeOwnerId, nativeEventType, active\.value && store\.trip\?\.id \? 'TRIP' : 'SHIFT'\)/, 'Recovery must not start GPS for a shift that is merely online and waiting.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /WorkRuntimePorts\.nativeGps.syncTrace\(endingShiftId, \{ entityType: 'SHIFT' \}\)/, 'Native shift-owned dead-movement points are committed before shift reconciliation.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/infrastructure/android/nativeGpsService.js'), 'utf8'), /async syncTrace\(tripId, \{ entityType = 'TRIP', clearAfterImport = false \} = \{\}\)/, 'Native GPS trace import supports both trip and shift ownership.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/infrastructure/android/nativeGpsService.js'), 'utf8'), /LocationRepository\.forEntity\(entityType, tripId\)/, 'Trace deduplication reads the canonical owner entity.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/infrastructure/location/movementTraceService.js'), 'utf8'), /async resumePersisted\(expectedSession\)/, 'Browser trace recovery validates persisted ownership and hydrates durable points.')
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/infrastructure/location/movementTraceService.js'), 'utf8'), /pause\(\) \{[\s\S]*owner marker and canonical points/, 'Leaving Work pauses the browser watch without deleting its recovery marker.')

assert.match(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /MovementReconciliationQueue\.matchLiveTrace/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/application/work/movementReconciliationQueue.js'), 'utf8'), /reconciledAfterReconnect/)
assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /liveKm: '0\.0 km'/)
assert.match(fs.readFileSync(path.join(process.cwd(), 'src/application/work/workService.js'), 'utf8'), /calculateLiveMovement\(points = \[\]\)/)
assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), 'src/views/WorkModuleView.vue'), 'utf8'), /from ['\"][^'\"]*\/domain\/movement\//)
const root = process.cwd()
const workView = fs.readFileSync(path.join(root, 'src/views/WorkModuleView.vue'), 'utf8') + '\n' + ['WorkContextForm.vue','WorkStartShiftForm.vue','WorkFareForm.vue','WorkCancellationForm.vue','WorkFuelForm.vue','WorkEndShiftForm.vue','WorkLiveMetrics.vue'].map(name => fs.readFileSync(path.join(root, 'src/components/work', name), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(root, 'src/styles/work-cockpit-hud.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'src/styles/kfe-base-shell.css'), 'utf8')
const workStore = fs.readFileSync(path.join(root, 'src/stores/shiftTrip.js'), 'utf8')
const workService = fs.readFileSync(path.join(root, 'src/application/work/workService.js'), 'utf8')

const workFuelForm = fs.readFileSync(path.join(root, 'src/components/work/WorkFuelForm.vue'), 'utf8')
assert.match(workView, /WorkRuntimePorts\.nativeGps\.syncTrace\(endingShiftId, \{ entityType: 'SHIFT' \}\)/, 'Native shift trace is committed before reconciliation.')
assert.match(workView, /WorkRuntimePorts\.movementTrace\.resumePersisted\(savedTrace\)/, 'Work uses the application-facing runtime port for browser trace recovery.')
assert.match(workView, /<WorkFuelForm v-else-if="type === 'fuel'/, 'Fuel entry has an independently replaceable form component.')
assert.match(workView, /<WorkStartShiftForm v-if="type === 'start'/, 'Start shift has an independent form component.')
assert.match(workView, /<WorkFareForm v-else-if="type === 'fare'/, 'Fare entry has an independent form component.')
assert.match(workView, /<WorkCancellationForm v-else-if="type === 'cancel'/, 'Cancellation has an independent form component.')
assert.match(workView, /<WorkEndShiftForm v-else-if="type === 'end'/, 'End-shift stages have an independent form component.')
assert.doesNotMatch(workView, /<form v-else-if="type === 'fuel'/, 'The parent form controller no longer owns the fuel form markup.')
assert.match(workFuelForm, /aria-label="Close fuel form"/)
assert.match(workFuelForm, /emit\('focus-numeric', 'fuel-odo'\)/, 'Fuel inputs emit a semantic focus event to the parent form controller.')
assert.match(workFuelForm, /@click="emit\('focus-numeric', 'fuel-price'\)"/, 'Repeated taps on the price field reopen the correct numeric keypad.')
assert.match(workFuelForm, /@click="emit\('focus-numeric', 'fuel-amount'\)"/, 'Repeated taps on the amount field reopen the correct numeric keypad.')
assert.doesNotMatch(workFuelForm, /emit\('action', 'focus-fuel-/, 'Fuel field focus must not be sent through unrelated workflow actions.')
assert.match(fs.readFileSync(path.join(root, 'src/views/WorkModuleView.vue'), 'utf8'), /backgroundLocationPermission\.backgroundLocationAllowed/, 'Work exposes reboot-recovery permission state without blocking the shift workflow.')
assert.match(fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8'), /android\.permission\.ACCESS_BACKGROUND_LOCATION/, 'Android declares the permission required for post-reboot location recovery.')
assert.match(fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java'), 'utf8'), /!hasBackgroundLocationPermission\(context\)/, 'Boot recovery does not silently claim GPS resumption without background permission.')
assert.match(fs.readFileSync(path.join(root, 'src/application/work/workService.js'), 'utf8'), /async recoverNativeGpsTraces\(\)/, 'Work startup can reconcile persisted native traces left by a killed WebView.')
assert.match(fs.readFileSync(path.join(root, 'src/application/work/workService.js'), 'utf8'), /cloud backup is blocked to avoid omitting movement evidence/, 'Unresolved native traces must block a misleadingly complete cloud backup.')
assert.match(fs.readFileSync(path.join(root, 'src/infrastructure/android/nativeGpsService.js'), 'utf8'), /Native Android GPS trace inventory unavailable[\s\S]*?throw error/, 'Native trace inventory failures must propagate to backup recovery.')
assert.match(fs.readFileSync(path.join(root, 'src/infrastructure/android/nativeGpsService.js'), 'utf8'), /async listTraceOwners\(\)/, 'Native trace files can be inventoried after process death.')
assert.match(fs.readFileSync(path.join(root, 'src/views/WorkModuleView.vue'), 'utf8'), /WorkService\.recoverNativeGpsTraces\(\)/, 'Work invokes native trace recovery during startup.')
assert.match(fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java'), 'utf8'), /point\.put\("entityType", entityType\)/, 'Native GPS trace files preserve canonical owner type.')
assert.match(fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsPlugin.java'), 'utf8'), /listTraceOwners/, 'Native trace files can be inventoried after process death.')
const workStyles = fs.readFileSync(path.join(root, 'src/styles/kfe-base-shell.css'), 'utf8')
const reconciliationView = fs.readFileSync(path.join(root, 'src/components/ShiftReconciliationModal.vue'), 'utf8')
assert.doesNotMatch(workView, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/, 'Opening fare entry must not auto-scroll the whole page when the compact form fits.')
assert.match(workStyles, /work-context-form\.form-fare \.kfe-work-number-pad__grid button\{min-height:31px!important;height:31px!important/, 'Fare keypad is compact enough to fit with its header and actions in the viewport.')
assert.match(workStyles, /--kfe-work-go-pickup:var\(--kfe-info/, 'Go to Pickup uses the semantic information/blue token.')
assert.match(workView, /WorkflowTimerService\.enter\(identity, Date\.now\(\)\)/, 'Workflow timers restore their persisted start timestamp for the same step identity.')
assert.match(workView, /const refreshClock = \(\) => \{ clock\.value = Date\.now\(\) \}/, 'Timer display derives from the current timestamp instead of counting callbacks.')
assert.match(workView, /setInterval\(refreshClock, 1000\)/, 'The 1 Hz display refresh invokes the timestamp-based clock refresh.')
assert.match(workView, /document\.addEventListener\('visibilitychange', refreshClock\)/, 'Work timer refreshes immediately when the Android WebView returns to visibility.')
assert.match(workView, /window\.addEventListener\('pageshow', refreshClock\)/, 'Work timer refreshes after Android restores the page from the back-forward cache.')
assert.match(workView, /window\.addEventListener\('focus', refreshClock\)/, 'Work timer refreshes immediately when the app regains focus.')
assert.match(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), /applicationId "com\.kanishka\.pwa"/, 'The APK preserves the original package identity for in-place upgrades and data continuity.')
assert.match(fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'), /versionCode 5[\s\S]*versionName \"2\.1\.1\"/, 'The corrected APK has a monotonic Android version code and release version.')

const memory = new Map()
const originalLocalStorage = globalThis.localStorage
globalThis.localStorage = { getItem: key => memory.has(key) ? memory.get(key) : null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) }
try {
  assert.equal(WorkflowTimerService.enter('shift-1:FARE_ENTRY', 1000), 1000)
  assert.equal(WorkflowTimerService.enter('shift-1:FARE_ENTRY', 9000), 1000, 'Reloading the same workflow step must preserve its original start timestamp.')
  assert.equal(WorkflowTimerService.enter('shift-1:READY', 10000), 10000, 'Changing workflow step must start a new timer.')
  assert.equal(WorkWorkflowSessionService.save({ form: 'fuel' }), true)
  assert.deepEqual(WorkWorkflowSessionService.read(), { form: 'fuel' }, 'An interrupted context form is restored from the durable workflow session.')
  assert.equal(WorkWorkflowSessionService.save(null), true)
  assert.equal(WorkWorkflowSessionService.read(), null, 'Closing a form clears the durable UI session marker.')
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalLocalStorage
}
assert.match(workStyles, /\.work-context-form \.kfe-work-number-pad\{position:relative!important/, 'The Work keypad must stay in document flow instead of covering the fixed swipe action.')
assert.doesNotMatch(workStyles, /\.work-context-form \.kfe-work-number-pad\{position:fixed/, 'The Work keypad must never be fixed over the swipe action.')
assert.match(workStyles, /color:var\(--kfe-ui-on-accent/, 'Primary actions use the dark on-accent text token for high contrast.')
assert.match(workView, /\.gap-panel[\s\S]*?background:var\(--kfe-ui-surface-2\)/, 'Odometer gap panel has an explicit semantic surface and readable foreground.')
assert.match(workView, /\.gap-panel \.choice-row button[\s\S]*?color:var\(--kfe-ui-text\)/, 'Personal KM and Dead KM choices explicitly define unselected text contrast.')
assert.match(workView, /\.gap-panel \.choice-row button\.selected[\s\S]*?color:var\(--kfe-ui-on-accent\)/, 'Selected gap allocation uses the canonical high-contrast on-accent foreground.')
assert.match(reconciliationView, /\.input-box input[\s\S]*?background: var\(--kfe-ui-input-bg\); color: var\(--kfe-ui-text\)/, 'Reconciliation inputs define explicit dark input background and text colors.')
assert.match(reconciliationView, /\.input-box input::placeholder[\s\S]*?color: var\(--kfe-ui-muted-strong\); opacity: 1/, 'Reconciliation placeholders remain readable and are not opacity-washed.')
assert.match(reconciliationView, /\.btn-submit[\s\S]*?color: var\(--kfe-ui-on-accent\)/, 'Reconciliation confirmation uses a contrasting foreground on the semantic success surface.')
assert.match(reconciliationView, /\.btn-submit:disabled[\s\S]*?color: var\(--kfe-ui-muted-strong\)/, 'Disabled reconciliation confirmation retains readable text and a neutral surface.')
assert.match(workView, /<WorkStartShiftForm/)
assert.match(workView, /<WorkFareForm/)
assert.match(workView, /<WorkCancellationForm/)
assert.match(workView, /<WorkEndShiftForm/)
assert.match(workView, /<WorkFuelForm/)

assert.match(workStyles, /@media\(max-width:600px\)/, 'Work form and keypad presentation includes a phone-width layout.')
assert.match(workStyles, /button:disabled[\s\S]{0,120}background:var\(--kfe-ui-surface-2/, 'Disabled actions retain a neutral readable surface rather than opacity-washing text.')
assert.match(workStyles, /\[aria-invalid="true"\]/, 'Invalid fields receive a visible semantic error treatment.')
assert.match(workStyles, /scroll-margin-bottom:calc\(var\(--kfe-base-nav,76px\) \+ 104px/, 'Keypad scrolling reserves space above the fixed swipe action and bottom navigation.')

const shiftTripRepository = fs.readFileSync(path.join(root, 'src/repositories/shiftTripRepository.js'), 'utf8')
const endShiftService = fs.readFileSync(path.join(root, 'src/application/work/endShift.js'), 'utf8')
assert.doesNotMatch(workStore, /pendingFareTrip/)
assert.doesNotMatch(workStore, /Enter the fare for the completed Trip before going Offline/)
assert.match(workStore, /WorkService\.completeTrip\(\{ id: tripId \}\)/)
assert.match(shiftTripRepository, /businessStartDate = setup\?\.values\?\.businessStartDate/)
assert.doesNotMatch(workView, /Enter revenue for every listed completed trip/)
assert.doesNotMatch(endShiftService, /reconciliationStatus === 'MISMATCH'/)
assert.doesNotMatch(endShiftService, /INCOMPLETE_TRIP_REVENUE_DETAIL/)
assert.doesNotMatch(workView, /Save or skip the optional trip details first/)
assert.doesNotMatch(workView, /cancelOpen\.value \|\| pendingFare\.value\) return/)
assert.match(workService, /GPS is telemetry\/enrichment/)
assert.match(workService, /ShiftTripRepository\.completeTrip\(\{ \.\.\.data \}\)/)
assert.doesNotMatch(workView, /stop\(\{captureFinal:true\}\)/)
assert.doesNotMatch(workService, /await WorkRuntimePorts\.nativeGps.start/)
assert.doesNotMatch(workService, /recordFareForActiveTrip/)
assert.doesNotMatch(shiftTripRepository, /recordFareForActiveTrip/)
assert.match(workService, /void \(async \(\) => \{/)
assert.match(workService, /native trace retained for recovery:[\s\S]*?finally \{\s*try \{ await WorkRuntimePorts\.nativeGps\.stop\(tripId\)/, 'A native trace import failure must not leave GPS tracking attached to a completed trip.')
assert.match(workView, /pendingFare/)
assert.doesNotMatch(workView, /OPTIONAL DETAILS/, 'Redundant optional-details heading stays removed from the Work flow.')
assert.match(workView, /deriveLiveRevenue/)
assert.match(workView, /REVENUE/)
assert.match(workView, /tripToll/)
assert.match(workView, /tripParking/)

const pendingFareCockpit = deriveWorkCockpitState({
  shift: { id: 'shift-1', status: 'ACTIVE', shiftStartAt: '2026-10-03T00:00:00.000Z' },
  trip: null,
  pendingFareId: 'trip-completed-1',
  asOf: Date.parse('2026-10-03T01:00:00.000Z')
})
assert.equal(pendingFareCockpit.state, WORK_COCKPIT_STATES.READY, 'Optional fare details must not block the next pickup')
assert.equal(pendingFareCockpit.action, 'GO_TO_PICKUP', 'Operational action remains pickup while fare is pending')
assert.equal(pendingFareCockpit.pendingFareId, 'trip-completed-1', 'Pending fare identity must remain available to the overlay')
assert.match(workView, /state\.pendingFareId && \(!store\.trip\?\.id \|\| store\.trip\.status !== 'ACTIVE'\) \? 'ENTER_FARE' : state\.action/)
assert.match(workView, /Recover the latest unpriced completed trip after a WebView\/PWA restart/)
assert.match(workView, /fareDetailsSkipped !== true/)
assert.match(workView, /recoveredPendingFareId/)
assert.match(workStore, /WorkService\.completeTrip\(\{ id: tripId \}\)/)
assert.match(workView, /TRIP COMPLETED/)
assert.match(workView, /stage === 'ENTER_FARE'/)
assert.match(workView, /swipeProgress>=SWIPE_CONFIG\.commitThresholdPercent/)
assert.doesNotMatch(workView, /swipe-copy"><span>\{\{ swipeProgress>=70 \? 'RELEASE' : 'SWIPE' \}\}<\/span>/, 'Temporary swipe hint text is absent.')
assert.match(workView, /<strong>\{\{ actionLabel \}\}<\/strong>/, 'The current trip action label remains visible.')
assert.match(workView, /class="done fare-save-action"[^>]*>\{\{ fareBusy \? 'SAVING…' : 'OK' \}\}<\/button>/, 'Fare keypad has one concise OK action.')
assert.match(workView, /<template v-if="type === 'fare'">[\s\S]*?fare-save-action[\s\S]*?fareBusy \? 'SAVING…' : 'OK'[\s\S]*?<\/template>/, 'Fare keypad uses one concise OK action instead of a second long save label.')
assert.match(workView, /\.form-fare \.kfe-work-number-pad__grid button\{min-height:31px/, 'Fare keypad keys use a compact height to fit the form in the viewport.')
assert.doesNotMatch(workView, /notify\('Going to pickup\.'\)|notify\('Trip active\.'\)|notify\('Trip ended\. Add optional details or skip\.'\)/, 'Trip state transitions do not show redundant confirmation prompts.')
assert.match(workView, /async function up\(event\)[\s\S]*const commit = swipeProgress\.value >= SWIPE_CONFIG\.commitThresholdPercent[\s\S]*if \(commit\) await doAction\(\)/, 'Swipe threshold and action transition remain aligned with the shared swipe configuration.')
assert.doesNotMatch(workView, /fareTripId\.value=null;fareTrip\.value=null;fare\.value=''\;onMounted/)
assert.deepEqual(validateShiftStartOdometer(100, 90), { valid: true, gapKm: 10 })
assert.deepEqual(validateShiftStartOdometer(100, null), { valid: true, gapKm: 0 }, 'No prior odometer is not a zero-km baseline')
assert.equal(validateShiftStartOdometer(89, 90).valid, false)
assert.deepEqual(validateFirstDayShiftStartOdometer(68500, 65000), { valid: true, gapKm: 3500, historicalKm: 3500, businessStartOdometer: 65000, historicalOdometerGap: true })
assert.deepEqual(validateFirstDayShiftStartOdometer(65000, 65000), { valid: true, gapKm: 0, historicalKm: 0, businessStartOdometer: 65000, historicalOdometerGap: false })
assert.deepEqual(validateFirstDayShiftStartOdometer(1000, null), { valid: true, gapKm: 0, historicalKm: 0, businessStartOdometer: null, historicalOdometerGap: false }, 'Missing business-start baseline must not classify the entire odometer as a gap')
assert.equal(validateFirstDayShiftStartOdometer(64999, 65000).valid, false)
assert.deepEqual(validateGapAllocation(180, 'PERSONAL'), { valid: true, category: 'PERSONAL', personalKm: 180, deadKm: 0 })
assert.deepEqual(validateGapAllocation(180, 'DEAD'), { valid: true, category: 'DEAD', personalKm: 0, deadKm: 180 })
assert.equal(validateGapAllocation(180).valid, false)
assert.equal(validateGapAllocation(180, 'PERSONAL').personalKm + validateGapAllocation(180, 'PERSONAL').deadKm, 180)
assert.equal(validateGapAllocation(180, 'DEAD').personalKm + validateGapAllocation(180, 'DEAD').deadKm, 180)
assert.deepEqual(validateGapAllocation(0), { valid: true, category: null, personalKm: 0, deadKm: 0 })
assert.equal(validateEndShiftEntry({ closingOdometer: 100, startOdometer: 100 }).valid, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 99, startOdometer: 100 }).valid, false)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100 }).requiresConfirmation, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100 }).valid, false)
assert.equal(validateEndShiftEntry({ closingOdometer: 600, startOdometer: 100, confirmLargeDistance: true }).valid, true)
assert.equal(validateEndShiftEntry({ closingOdometer: 600, startOdometer: 100 }).distanceKm, 500)
assert.equal(validateEndShiftEntry({ closingOdometer: 601, startOdometer: 100 }).requiresConfirmation, true)
assert.deepEqual(WORK_TRIP_OPERATORS, ['Uber', 'One way', 'Rapido', 'Ola', 'Savaari'])
assert.equal(validateTripOperator('Uber').valid, true)
assert.equal(validateTripOperator('Unknown').valid, false)
assert.equal(validateTripCorrection({ operator: 'Ola', tripKm: '12.5', revenue: '300' }).valid, true)
assert.deepEqual(validateTripCorrection({ operator: 'Ola', revenue: '150', cancelReason: 'PASSENGER_CANCELLED' }), { valid: true, operator: 'Ola', revenue: 150, cancelReason: 'PASSENGER_CANCELLED' })
assert.equal(validateTripCorrection({ cancelReason: '' }).valid, false)
assert.deepEqual(validateTripCorrection({ toll: '50', parking: '20' }), { valid: true, toll: 50, parking: 20 })
assert.equal(validateTripCorrection({ toll: '-1' }).valid, false)
const pickupState = deriveWorkCockpitState({ shift: { id: 's1', status: 'ACTIVE', shiftStartAt: '2026-10-01T08:00:00+05:30' }, trip: { id: 't1', status: 'ACTIVE', tripStage: 'PICKUP' }, trips: [{ id: 't0', status: 'COMPLETED', revenue: null }], pendingFareId: 't0', notificationPhase: 'ENTER_FARE', asOf: Date.parse('2026-10-01T08:01:00+05:30') })
assert.equal(pickupState.state, WORK_COCKPIT_STATES.GOING_TO_PICKUP)
assert.equal(pickupState.action, 'START_RIDE')
const nextPickupState = deriveWorkCockpitState({ shift: { id: 's1', status: 'ACTIVE', shiftStartAt: '2026-10-01T08:00:00+05:30' }, trip: null, trips: [{ id: 't0', status: 'COMPLETED', revenue: null }], pendingFareId: 't0', notificationPhase: 'ENTER_FARE', asOf: Date.parse('2026-10-01T08:01:00+05:30') })
assert.equal(nextPickupState.state, WORK_COCKPIT_STATES.READY)
assert.equal(nextPickupState.action, 'GO_TO_PICKUP')
assert.equal(calculateTripRevenueDetail([{ status: 'COMPLETED', revenue: 100 }, { status: 'CANCELLED', revenue: 500 }, { status: 'COMPLETED', revenue: null }]), 100)
assert.equal(calculateFuelQuantity({ pricePerKg: 82, amount: 410 }).quantityKg, 5)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230 }).quantityKg, 15)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230.01 }).valid, false)
assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 1230.01 }).reason, 'FUEL_QUANTITY_EXCEEDS_TANK_CAPACITY_15KG')


console.log('KFE Work contract tests: PASS — completed trips persist before optional details; trip fares do not gate pickup or shift closure.')