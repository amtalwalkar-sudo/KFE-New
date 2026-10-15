import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const gesture = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeSwipeGesture.java', 'utf8')
const store = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeEventStore.java', 'utf8')

assert.match(service, /progress=KfeSwipeGesture\.progress\(dx,maxTravel\)/)
assert.match(service, /KfeSwipeGesture\.shouldCommit\(fx,maxTravel,dp\(8\),0\.70f\)/)
assert.match(service, /Log\.d\("KFE-SWIPE","down stage=/)
assert.match(service, /Log\.d\("KFE-SWIPE","move stage=/)
assert.match(service, /KfePendingActionState\.matchesAwaitingEvent\(awaitingEventId,eventId\)/)
assert.match(service, /Log\.i\("KFE-SWIPE","release stage=/)
assert.match(service, /Log\.i\("KFE-SWIPE","dispatch stage=/)
assert.match(service, /Log\.i\("KFE-SWIPE","acknowledged event=/)
assert.match(service, /stage transition GO_TO_PICKUP -> START_RIDE/)
assert.match(service, /WAITING FOR APP · /)
assert.match(service, /pending-action recovery required event=/)
assert.match(gesture, /displacementX \/ maxTravel/)
assert.match(gesture, /displacementX > Math\.max\(0f, movementSlop\)/)
assert.match(gesture, /progress\(displacementX, maxTravel\) >= threshold/)
assert.match(store, /status=\?/)
console.log('KFE native swipe gesture and pending recovery contract: PASS')
