import assert from 'node:assert/strict'
import fs from 'node:fs'

const work = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const engine = fs.readFileSync('src/domain/performance/performanceEngineV2.js', 'utf8')
const roadmap = fs.readFileSync('docs/KFE-DEVELOPMENT-PHASES.md', 'utf8')

assert.match(work, /const targetAchieved = ref\(0\)/)
assert.match(work, /PerformanceService\.getMetrics\(snapshot, reportingRangeFor\('DAY', now\)\)/)
assert.doesNotMatch(work, /targetAchieved[^\n]*completedTrips[^\n]*revenue/)
assert.doesNotMatch(work, /targetAchieved[^\n]*trip\?\.revenue/)
assert.match(engine, /authoritativeShiftRevenue\(S, x\)/)
assert.match(engine, /revenue: a\.revenue/)
assert.match(roadmap, /Phase 12.*Final End-to-End/)

console.log('KFE Phase 12 final release audit contract: PASS')
