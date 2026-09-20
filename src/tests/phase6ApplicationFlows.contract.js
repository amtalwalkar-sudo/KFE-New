import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=p=>fs.readFileSync(p,'utf8')
const work=read('src/views/WorkModuleView.vue'), timeline=read('src/views/TimelineView.vue'), performance=read('src/views/PerformanceView.vue'), admin=read('src/views/AdminView.vue')
for(const p of ['src/application/work/workService.js','src/application/timeline/timelineService.js','src/application/performance/performanceService.js','src/application/performance/driverTargetService.js','src/application/admin/adminService.js']) assert.ok(fs.existsSync(p),`Missing application owner: ${p}`)
assert.match(work,/Start Shift|START SHIFT/); assert.match(work,/End Shift|Offline/); assert.match(work,/Current Odometer|startOdometer/i); assert.match(work,/target|Target/i)
assert.doesNotMatch(timeline,/indexedDB|objectStore\(/); assert.doesNotMatch(performance,/indexedDB|objectStore\(/); assert.doesNotMatch(admin,/indexedDB|objectStore\(/)
assert.doesNotMatch(admin,/createRide|createShift|driverCollectedData/)
assert.match(timeline,/Authoritative Revenue/)
console.log('KFE Phase 6 application-flow ownership contract: PASS')