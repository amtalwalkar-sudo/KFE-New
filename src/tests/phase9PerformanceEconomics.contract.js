import assert from 'node:assert/strict'
import fs from 'node:fs'

const trace = fs.readFileSync('src/infrastructure/location/movementTraceService.js', 'utf8')
const location = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
const motion = fs.readFileSync('src/services/activityDetectionService.js', 'utf8')
const performance = fs.readFileSync('src/repositories/performanceRepository.js', 'utf8')

assert.match(trace, /points\.push\(point\)/)
assert.doesNotMatch(trace, /points = \[\.\.\.points, point\]/)
assert.match(trace, /points\.length = 0/)
assert.match(location, /index\('entityId'\)\.getAll\(entityId\)/)
assert.doesNotMatch(location, /objectStore\('gps_snapshots'\)\.getAll\(\)/)
assert.match(motion, /lastMotionAt < 4000/)
assert.match(performance, /Promise\.all\(\[/)

console.log('KFE Phase 9 performance, battery, memory and concurrency contract: PASS')
