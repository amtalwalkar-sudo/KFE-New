import assert from 'node:assert/strict'
import fs from 'node:fs'
import { deriveLiveRevenue } from '../domain/work/liveRevenue.js'
import { SWIPE_CONFIG } from '../domain/work/swipeConfig.js'
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'COMPLETED',revenue:150}]),400)
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'CANCELLED',revenue:40,cancelledRevenue:40},{status:'ACTIVE',revenue:900},{status:'COMPLETED',revenue:null,fareDetailsSkipped:true}]),290)
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:-1},{status:'COMPLETED',revenue:'invalid'}]),0)
assert.equal(SWIPE_CONFIG.commitThresholdPercent,70)
assert.equal(SWIPE_CONFIG.returnDurationMs,220)
const view=fs.readFileSync(new URL('../views/WorkModuleView.vue',import.meta.url),'utf8')
const overlay=fs.readFileSync(new URL('../../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java',import.meta.url),'utf8')
const service=fs.readFileSync(new URL('../application/work/workService.js',import.meta.url),'utf8')
assert.match(view,/deriveLiveRevenue\(store\.registeredTrips\.filter/)
assert.match(view,/phaseStartAt: stateTimerStartAt\.value/)
assert.match(view,/swipeConfig: SWIPE_CONFIG/)
assert.doesNotMatch(overlay,/liveKm|resolveMovementValue|DEAD KM|BUSINESS KM/)
assert.match(overlay,/formatPhaseTime\(\)/)
assert.match(overlay,/canonical\.commitTripForm\(operationId,mode,trip\)/)
assert.doesNotMatch(overlay,/refreshCanonicalRevenue/)
assert.match(service,/ShiftTripRepository\.setTripStage/)
assert.match(service,/ShiftTripRepository\.completeTrip/)
assert.doesNotMatch(service,/captureLifecycleLocation|nativeGps|ValhallaRoutingAdapter/)
console.log('Live revenue and native swipe parity contract: PASS; timer and revenue remain visible without live-km tracking.')
