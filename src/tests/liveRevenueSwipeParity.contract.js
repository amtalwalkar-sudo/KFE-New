import assert from 'node:assert/strict'
import fs from 'node:fs'
import { deriveLiveRevenue } from '../domain/work/liveRevenue.js'
import { SWIPE_CONFIG } from '../domain/work/swipeConfig.js'
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'COMPLETED',revenue:150}]),400)
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:250},{status:'CANCELLED',revenue:40,cancelledRevenue:40},{status:'ACTIVE',revenue:900},{status:'COMPLETED',revenue:null,fareDetailsSkipped:true}]),290)
assert.equal(deriveLiveRevenue([{status:'COMPLETED',revenue:-1},{status:'COMPLETED',revenue:'invalid'}]),0)
assert.equal(SWIPE_CONFIG.commitThresholdPercent,70)
assert.equal(SWIPE_CONFIG.returnDurationMs,180)
assert.equal(SWIPE_CONFIG.pickupColor,'#78A2FF')
assert.equal(SWIPE_CONFIG.startColor,'#62D18A')
assert.equal(SWIPE_CONFIG.endColor,'#FF8585')
const view=fs.readFileSync(new URL('../views/WorkModuleView.vue',import.meta.url),'utf8')
assert.match(view,/deriveLiveRevenue\(store\.registeredTrips\)/)
assert.match(view,/phaseStartAt: stateTimerStartAt\.value/)
assert.match(view,/swipeConfig: SWIPE_CONFIG/)
console.log('PASS: live revenue model and shared swipe configuration')
