import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const service = fs.readFileSync(path.join(root, 'src/infrastructure/android/kfeRideNotificationService.js'), 'utf8')
const plugin = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java'), 'utf8')
const receiver = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java'), 'utf8')
const overlay = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java'), 'utf8')
assert.match(service, /ENTER_PICKUP_DURATION/)
assert.match(service, /ENTER_RIDE_DURATION/)
assert.match(service, /END_RIDE/)
assert.match(service, /clearPendingAction/)
assert.match(service, /TWO_MINUTES/)
assert.match(plugin, /setOngoing\(true\)/)
assert.match(plugin, /RemoteInput/)
assert.match(plugin, /GO_TO_PICKUP/)
assert.match(plugin, /START_RIDE/)
assert.match(plugin, /END_RIDE/)
assert.match(receiver, /RemoteInput\.getResultsFromIntent/)
assert.match(overlay, /windowManager\.updateViewLayout\(overlayRoot,params\)/)
assert.doesNotMatch(overlay, /windowManager\.updateViewLayout\(this,params\)/)
assert.match(overlay, /BUBBLE_DP = 58/)
assert.match(overlay, /MINIMIZE_SWIPE_DP = 48/)
assert.match(overlay, /minimized=true/)
assert.match(overlay, /params\.width=dp\(BUBBLE_DP\)/)
assert.match(overlay, /params\.height=dp\(BUBBLE_DP\)/)
assert.match(overlay, /SOFT_INPUT_ADJUST_RESIZE\|WindowManager\.LayoutParams\.SOFT_INPUT_STATE_ALWAYS_VISIBLE/)
assert.match(overlay, /emitAction\(actionStage,pendingTripId/)
assert.match(overlay, /emitAction\("ENTER_FARE",pendingTripId,fare/)

// CI verification marker for the native notification bridge.
console.log('KFE ride notification contract tests passed')
