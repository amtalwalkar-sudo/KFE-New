import assert from 'node:assert/strict'
import fs from 'node:fs'

const backupService = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
const backupRepository = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const indexedDb = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const startup = fs.readFileSync('src/application/startup/startupService.js', 'utf8')
const nativeStore = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', 'utf8')
const nativeEvents = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeEventStore.java', 'utf8')
const nativeActions = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeWorkActionsPlugin.java', 'utf8')
const nativeAdapter = fs.readFileSync('src/infrastructure/android/nativeCanonicalWork.js', 'utf8')
const instrumentation = fs.readFileSync('android/app/src/androidTest/java/com/kanishka/pwa/KfeCanonicalResetProtocolTest.java', 'utf8')

assert.match(backupService, /setCanonicalResetBarrier\(resetId\)[\s\S]*state: 'CHECKPOINTING'[\s\S]*await createBackup\(\)[\s\S]*saveResetCheckpoint\(resetId, checkpoint\)[\s\S]*verifyResetCheckpoint\(checkpoint, resetId\)/,
  'Reset must block writes before taking and verifying its durable checkpoint.')
assert.match(backupService, /setCanonicalResetBarrier\(resetId\)[\s\S]*saveResetJournal\([\s\S]*state: 'CHECKPOINTING'/,
  'Reset must establish a synchronous mutation barrier and durable reset journal before either store is cleared.')
assert.match(backupService, /await NativeCanonicalWorkService\.beginCanonicalReset\(resetId\)/,
  'Native reset intent must be durable before native canonical records are cleared.')
assert.match(backupService, /await backupRepository\.resetCanonicalData\(\{ resetId \}\)[\s\S]*await NativeCanonicalWorkService\.clearCanonicalReset\(resetId\)/,
  'Browser and native clear phases must use the same reset ID and be retryable.')
assert.match(backupService, /await NativeCanonicalWorkService\.completeCanonicalReset\(resetId\)[\s\S]*nativeState\.state !== 'COMPLETE'/,
  'Reset must verify native completion before reporting success.')
assert.match(backupService, /getBackupSummary\(after\)\.totalRecords !== 0/,
  'Reset must verify that the browser canonical stores are empty.')
assert.match(backupService, /Pending reset cannot resume because its verified recovery checkpoint is missing or changed/,
  'Recovery must fail closed if the checkpoint is missing or changed.')
assert.match(indexedDb, /Canonical mutation blocked while reset/,
  'New canonical read-write transactions must be blocked while reset is pending.')
assert.match(indexedDb, /withCanonicalResetWritePermission/,
  'Only the matching reset ID can create the privileged browser clear transaction.')
assert.match(backupRepository, /resetStores = \[\.\.\.new Set\(\[\.\.\.stores, 'form_drafts', 'canonical_operations'\]\)\]/,
  'Reset must clear settings, drafts, and the browser canonical operation ledger.')
assert.match(backupRepository, /async verifyCanonicalReset\(\)/, 'Reset verifies every canonical store, not only exportable backup stores.')
assert.match(backupService, /assertNoActiveShift\(checkpoint\)/, 'Browser-side active shifts must block reset even if the native mirror is stale.')
assert.match(startup, /await BackupService\.recoverPendingReset\(\)[\s\S]*await MutationRepository\.recoverStaleSyncing\(\)/,
  'Pending reset recovery must precede stale mutation replay at startup.')
assert.match(nativeStore, /canonical_reset_state[\s\S]*CANCELLED_BY_RESET/,
  'Native reset state is durable and old create intents are cancelled.')
assert.match(nativeStore, /assertNoPendingReset\(\)/,
  'Native canonical write paths must enforce the reset barrier.')
assert.match(nativeEvents, /cancelPendingForReset\(String resetId\)/, 'Reset must invalidate queued native lifecycle events.')
assert.match(nativeActions, /beginResetBarrier[\s\S]*releaseResetBarrier[\s\S]*cancelPendingForReset/, 'Native lifecycle events must remain blocked through the reset protocol.')
assert.match(nativeAdapter, /assertNoResetInProgress\(\)/, 'Native bridge writes must honor the browser reset barrier until release.')
for (const method of ['beginCanonicalReset', 'clearCanonicalReset', 'completeCanonicalReset', 'releaseCanonicalReset', 'getCanonicalResetState']) {
  assert.ok(nativePlugin.includes(method), `Native plugin must expose ${method}.`)
}
assert.match(instrumentation, /active canonical shift[\s\S]*Simulate process death[\s\S]*Create intents must be blocked[\s\S]*completeReset/,
  'Android instrumentation must cover active-shift protection, restart recovery, pending-write rejection and idempotent completion.')

console.log('Cross-store reset protocol contract: PASS')
