import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../../android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', import.meta.url), 'utf8')
const plugin = fs.readFileSync(new URL('../../android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', import.meta.url), 'utf8')
const shiftTrip = fs.readFileSync(new URL('../stores/shiftTrip.js', import.meta.url), 'utf8')
const view = fs.readFileSync(new URL('../views/WorkModuleView.vue', import.meta.url), 'utf8')
const androidTest = fs.readFileSync(new URL('../../android/app/src/androidTest/java/com/kanishka/pwa/KfeCreateIntentRecoveryTest.java', import.meta.url), 'utf8')
const commit = service.slice(service.indexOf('const commitNativeFirst'), service.indexOf('const findNativeRecord'))
assert.ok(commit.indexOf('await CanonicalWorkBoundary.putRecord') < commit.indexOf('await ShiftTripRepository.syncCanonicalRecords'), 'native acknowledgement must precede IndexedDB refresh')
assert.ok(commit.includes('result?.accepted !== true || !result?.outcome?.record'), 'unacknowledged native commits must fail closed')
assert.ok(commit.includes('const operationId ='), 'native operation identity must be stable for the record version')
for (const [method, nextMethod] of [
  ['async startShift(data)', 'async startTrip(data)'],
  ['async startTrip(data)', 'async startRide(data)'],
  ['async startRide(data)', 'async completeTrip(data)'],
  ['async completeTrip(data)', 'async cancelTrip(data)'],
  ['async cancelTrip(data)', 'async updateTrip(data)'],
  ['async updateTrip(data)', 'async updateFuel(data)'],
  ['async endShift(data)', 'async recordFuel(data)'],
]) {
  const start = service.indexOf(method)
  const body = service.slice(start, service.indexOf(nextMethod, start + method.length))
  assert.ok(start >= 0 && body.length > 0, `missing lifecycle method ${method}`)
  assert.ok(body.includes('requireLifecycleStorage()'), `${method} must reject unsafe Android fallback before mutation`)
  assert.ok(body.includes('nativeAvailable'), `${method} must use the captured storage availability decision`)
  assert.ok(!body.includes('nativeCanonicalAvailable()'), `${method} must not re-check availability and race into a different write path`)
}
const endShift = service.slice(service.indexOf('async endShift(data)'), service.indexOf('async recordFuel(data)'))
assert.ok(endShift.includes('const activeTrip = snapshot.trips.find'), 'shift close must check native active-trip state')
assert.ok(endShift.indexOf("await commitNativeFirst('SHIFT', completedShift)") < endShift.indexOf('checkpoint()'), 'shift close must commit before post-commit work')
console.log('PASS: native-first PWA lifecycle commit ordering')

assert.ok(store.includes('CREATE TABLE IF NOT EXISTS canonical_create_intents'), 'SQLite must persist create intents across process death')
assert.ok(store.includes('"entity_type=? AND intent_key=?"'), 'retry must find a prior create intent regardless of whether completion acknowledgement was recorded')
assert.ok(store.includes('existing.put("status", state.getString(0))'), 'retry must observe durable intent status and skip replay for completed intents')
assert.ok(store.includes('existing.put("record", new JSONObject(cursor.getString(2)))'), 'retry must reuse the original record identity and payload')
assert.ok(store.includes('values.put("status", "COMPLETED")'), 'intent completion must be durable after native record acknowledgement')
assert.ok(plugin.includes('prepareCreateIntent') && plugin.includes('completeCreateIntent'), 'native bridge must expose durable intent lifecycle')
assert.ok(service.includes('CanonicalWorkBoundary.prepareCreateIntent'), 'PWA create must persist intent before canonical record commit')
assert.ok(service.indexOf('const intent = await CanonicalWorkBoundary.prepareCreateIntent') < service.indexOf('const result = await CanonicalWorkBoundary.putRecord({'), 'intent journal must precede record write')
assert.ok(service.includes('await CanonicalWorkBoundary.completeCreateIntent(intent.intentId)'), 'intent completes only after native record acknowledgement')
assert.ok(service.includes("return await commitPreparedCreateIntent('SHIFT', record, data)"), 'Start Shift must use crash-recoverable create intent')
assert.ok(service.includes("return await commitPreparedCreateIntent('TRIP', record, tripData)"), 'Start Trip must use crash-recoverable create intent')

assert.ok(store.includes('"entity_type=? AND intent_key=?"'), 'intent lookup must include completed intents, not only pending intents')
assert.ok(service.includes("if (intent.status !== 'COMPLETED')"), 'retry after intent completion must reuse the completed intent instead of creating again')
assert.ok(service.includes('operationId: intent.operationId, entityType, record: intent.record, expectAbsent: true'), 'crash recovery must replay the exact persisted operation and record')
assert.ok(service.includes('Completed intents are retained as idempotency keys'), 'completed intent retention must protect lost final acknowledgements')

assert.ok(service.includes('data?.createIntentKey || data?.idempotencyKey'), 'create intent must use a durable caller-owned submission token')
assert.ok(shiftTrip.includes('createIntentKey = \'\'') && shiftTrip.includes('createIntentKey: createIntentKey'), 'shift and trip stores must pass create intent tokens into WorkService')
assert.ok(view.includes('await saveDraft(startDraftIdentity()') && view.includes('startWorkflowId.value)'), 'shift create token must be durably stored before submission')
assert.ok(view.includes('await saveDraft(identity, { createIntentKey })'), 'trip create token must be durably stored before submission')
assert.ok(androidTest.includes('Retry after the final acknowledgement is lost must reuse the completed intent'), 'instrumentation must cover retry after completion acknowledgement loss')
assert.match(androidTest, /prepareCreateIntentProcessDeathAtDurableBoundary/, 'Android instrumentation must park after the durable create-intent boundary for real process-death testing.')
assert.match(androidTest, /verifyCreateIntentProcessDeathRecovery/, 'Android instrumentation must recover the same create intent in a fresh process after SIGKILL.')
const androidGate = fs.readFileSync(new URL('../../tools/android-exact-apk-smoke-gate.sh', import.meta.url), 'utf8')
assert.match(androidGate, /KfeCreateIntentRecoveryTest#pendingCreateIntentReusesIdentityAndOperationAfterLostAcknowledgement create-intent-trip-crash-retry 1/, 'The release gate must isolate the existing trip create-intent retry test from process-death harness tests.')
assert.match(androidGate, /KfeCreateIntentRecoveryTest#shiftCreateIntentAlsoSurvivesRestartAndReusesRecordIdentity create-intent-shift-crash-retry 1/, 'The release gate must isolate the existing shift create-intent retry test from process-death harness tests.')
assert.doesNotMatch(androidGate, /run_instrumentation com\.kanishka\.pwa\.KfeCreateIntentRecoveryTest create-intent-crash-retry 2/, 'The create-intent class must not be run wholesale because process-death preparation tests intentionally park until SIGKILL.')
assert.match(androidGate, /run_create_intent_process_death_case SHIFT AFTER_INTENT/, 'The release gate must verify Start Shift intent recovery after process death before canonical commit.')
assert.match(androidGate, /run_create_intent_process_death_case TRIP AFTER_CANONICAL/, 'The release gate must verify Start Trip identity after process death between canonical commit and intent completion.')
assert.match(androidGate, /CREATE_INTENT_PROCESS_DEATH_CASE_PASS entityType=\$entity_type boundary=\$boundary/, 'The release gate must require an explicit create-intent recovery pass marker.')
