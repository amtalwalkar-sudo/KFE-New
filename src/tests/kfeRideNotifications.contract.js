import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const service = fs.readFileSync(path.join(root, 'src/services/kfeRideNotificationService.js'), 'utf8')
const plugin = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationsPlugin.java'), 'utf8')
const receiver = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeRideNotificationReceiver.java'), 'utf8')
assert.match(service, /ENTER_PICKUP_DURATION/)
assert.match(service, /ENTER_RIDE_DURATION/)
assert.match(service, /END_RIDE/)
assert.match(service, /TWO_MINUTES/)
assert.match(plugin, /setOngoing\(true\)/)
assert.match(plugin, /RemoteInput/)
assert.match(plugin, /GO_TO_PICKUP/)
assert.match(plugin, /START_RIDE/)
assert.match(plugin, /END_RIDE/)
assert.match(receiver, /RemoteInput\.getResultsFromIntent/)
// CI verification marker for the native notification bridge.
console.log('KFE ride notification contract tests passed')
