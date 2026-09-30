import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/views/TimelineView.vue', 'utf8')
const service = fs.readFileSync('src/application/timeline/timelineService.js', 'utf8')
const endShift = fs.readFileSync('src/application/work/endShift.js', 'utf8')
const cockpit = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const performanceService = fs.readFileSync('src/application/performance/performanceService.js', 'utf8')

assert.match(timeline, /TimelineService/)
assert.match(timeline, /Day/)
assert.match(timeline, /Personal/)
assert.match(timeline, /Week/)
assert.match(timeline, /Month/)
assert.doesNotMatch(timeline, /Operator.*filter|showOperators|chooseOperator/)
assert.doesNotMatch(timeline, /totalRevenue\s*=|reduce\(\(n,t\).*revenue/)
assert.match(timeline, /Authoritative Revenue/)
assert.match(timeline, /Target/)
assert.match(timeline, /Fare —/)
assert.match(service, /OperationalRecordService/)
assert.match(service, /authoritativeRevenue/)
assert.match(service, /record\.shift\.openingPersonalKm/)
assert.match(endShift, /revenue/)
assert.doesNotMatch(endShift, /calculateShiftRevenue/)
assert.match(cockpit, /PerformanceService\.getDailyTargetSnapshot\(\)/)
assert.match(cockpit, /shiftRevenue/)
assert.match(performanceService, /getDailyTargetSnapshot/)

console.log('KFE Timeline contract tests: PASS')
