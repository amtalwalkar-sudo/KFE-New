import assert from 'node:assert/strict'
import fs from 'node:fs'

const repository = fs.readFileSync('src/repositories/performanceRepository.js', 'utf8')

assert.match(repository, /PERFORMANCE_STORES = Object\.freeze/)
assert.match(repository, /db\.transaction\(\[\.\.\.PERFORMANCE_STORES\], 'readonly'\)/)
assert.doesNotMatch(repository, /Promise\.all\(\[\s*readAll\(/)
const workService = fs.readFileSync('src/application/work/workService.js', 'utf8')
const shiftDomain = fs.readFileSync('src/domain/work/shift.js', 'utf8')
assert.doesNotMatch(workService, /nativeGps|MovementTraceService|captureLifecycleLocation|ValhallaRoutingAdapter|routeTrace/)
assert.match(shiftDomain, /validateShiftStartOdometer/)
assert.match(shiftDomain, /validateEndShiftEntry|validateGapAllocation/)

console.log('KFE Phase 9 performance, battery and persistence-economics contract: PASS')
