import assert from 'node:assert/strict'
import fs from 'node:fs'

const backupService = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
const backupRepository = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const indexedDb = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const startup = fs.readFileSync('src/application/startup/startupService.js', 'utf8')
const nativeStore = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const nativePlugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkPlugin.java', 'utf8')
const instrumentation = fs.readFileSync('android/app/src/androidTest/java/com/kanishka/pwa/KfeCanonicalResetProtocolTest.java', 'utf8')

assert.match(backupService, /await createBackup\(\)[\s\S]*await saveLocalBackup\(checkpoint\)[\s\S]*await verifyResetCheckpoint\(checkpoint\)/,
  'Reset must durably create and verify a checkpoint before destructive work.')
assert.match(backupService, /setCanonicalResetBarrier\(resetId\)[\s\S]*saveResetJournal\([\s\S]*state: 'PREPARED'/,
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
assert.match(backupRepository, /resetStores = \[\.\.\.new Set\(\[\.\.\.stores, 'form_drafts'\]\)\]/,
  'Reset must clear canonical settings to restore factory defaults and clear drafts.')
assert.match(startup, /await BackupService\.recoverPendingReset\(\)[\s\S]*await MutationRepository\.recoverStaleSyncing\(\)/,
  'Pending reset recovery must precede stale mutation replay at startup.')
assert.match(nativeStore, /canonical_reset_state[\s\S]*CANCELLED_BY_RESET/,
  'Native reset state is durable and old create intents are cancelled.')
assert.match(nativeStore, /assertNoPendingReset\(\)/,
  'Native canonical write paths must enforce the reset barrier.')
for (const method of ['beginCanonicalReset', 'clearCanonicalReset', 'completeCanonicalReset', 'getCanonicalResetState']) {
  assert.ok(nativePlugin.includes(method), `Native plugin must expose ${method}.`)
}
assert.match(instrumentation, /active canonical shift[\s\S]*Simulate process death[\s\S]*Create intents must be blocked[\s\S]*completeReset/,
  'Android instrumentation must cover active-shift protection, restart recovery, pending-write rejection and idempotent completion.')

console.log('Cross-store reset protocol contract: PASS')
