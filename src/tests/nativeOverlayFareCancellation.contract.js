import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const overlay = read('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const store = read('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java')
const pwa = read('src/views/WorkModuleView.vue')
const workActions = read('src/infrastructure/android/nativeWorkActions.js')

assert.match(overlay, /private void persistCanonicalTripForm\(String mode,String tripId,JSONObject input\)/)
assert.match(overlay, /native-form-\"\+mode\+\"-\"\+tripId/)
assert.match(overlay, /canonical\.putRecord\(operationId,\"TRIP\",trip\)/)
assert.match(overlay, /trip\.put\(\"status\",\"COMPLETED\"\)/)
assert.match(overlay, /trip\.put\(\"status\",\"CANCELLED\"\)/)
assert.match(overlay, /trip\.put\(\"fareDetailsSkipped\"/)
assert.match(overlay, /trip\.put\(\"cancelReason\"/)
assert.match(overlay, /finishNativeFormCommit\(\)/)
assert.match(store, /operationId was already used for a different command/)

const fareBranch = overlay.slice(overlay.indexOf('if("FARE".equals(formMode)){', overlay.indexOf('private void submitNumericForm')), overlay.indexOf('}else if("CANCEL".equals(formMode)){', overlay.indexOf('private void submitNumericForm')))
const cancelBranch = overlay.slice(overlay.indexOf('}else if("CANCEL".equals(formMode)){', overlay.indexOf('private void submitNumericForm')), overlay.indexOf('\n  }\n\n  private void persistCanonicalTripForm', overlay.indexOf('private void submitNumericForm')))
assert.ok(fareBranch.indexOf('persistCanonicalTripForm("FARE"') >= 0)
assert.ok(fareBranch.indexOf('persistCanonicalTripForm("FARE"') < fareBranch.indexOf('recordPendingAction'), 'Fare canonical commit must precede queued PWA replay')
assert.ok(cancelBranch.indexOf('persistCanonicalTripForm("CANCEL"') >= 0)
assert.ok(cancelBranch.indexOf('persistCanonicalTripForm("CANCEL"') < cancelBranch.indexOf('recordPendingAction'), 'Cancellation canonical commit must precede queued PWA replay')
assert.doesNotMatch(fareBranch + cancelBranch, /new Intent\(this,\s*MainActivity\.class\)|startActivity\(/, 'Native form submit must not launch the main activity')

assert.match(pwa, /if \(stage === 'CANCEL_RIDE'\)/)
assert.match(pwa, /if \(stage === 'ENTER_FARE' && event\?\.input != null\)/)
assert.match(pwa, /acknowledgeAction\(/)
assert.match(workActions, /getPendingActions\(\)/)
assert.match(workActions, /acknowledgeAction\(\{ eventId, stage, tripId \}\)/)
console.log('PASS: native overlay fare/cancellation canonical commit and replay contract')
