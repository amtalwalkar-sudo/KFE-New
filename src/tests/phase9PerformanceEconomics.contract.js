import assert from 'node:assert/strict'
import fs from 'node:fs'

const repository = fs.readFileSync('src/repositories/performanceRepository.js', 'utf8')
const location = fs.readFileSync('src/services/locationService.js', 'utf8')
const trace = fs.readFileSync('src/infrastructure/location/movementTraceService.js', 'utf8')

assert.match(repository, /PERFORMANCE_STORES = Object\.freeze/)
assert.match(repository, /db\.transaction\(\[\.\.\.PERFORMANCE_STORES\], 'readonly'\)/)
assert.doesNotMatch(repository, /Promise\.all\(\[\s*readAll\(/)
assert.match(location, /enableHighAccuracy: false/)
assert.match(location, /maximumAge: 30000/)
assert.match(trace, /DEAD_LEG: 20 \* 1000/)
assert.match(trace, /PASSENGER_RIDE: 20 \* 1000/)
assert.match(trace, /pendingWrites = pendingWrites\.catch\(\(\) => \{\}\)\.then\(write\)/)
assert.match(trace, /if \(point\.accuracy != null && point\.accuracy > 100\) return false/)

console.log('KFE Phase 9 performance, battery and persistence-economics contract: PASS')
