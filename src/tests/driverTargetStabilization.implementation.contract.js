import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const service = fs.readFileSync(path.join(root, 'src/application/performance/driverTargetService.js'), 'utf8')
const repository = fs.readFileSync(path.join(root, 'src/repositories/performanceRepository.js'), 'utf8')
const stabilization = fs.readFileSync(path.join(root, 'src/domain/performance/driverTargetStabilization.js'), 'utf8')
const authority = fs.readFileSync(path.join(root, 'src/domain/performance/driverTarget.js'), 'utf8')

assert.match(service, /PerformanceRepository\.getSnapshot\(\)/, 'Target service must read the canonical performance snapshot')
assert.match(service, /normalizeCalculationSnapshot\(/, 'Target service must normalize canonical inputs before calculation')
assert.match(service, /deriveFinanceAwarePerformance\(/, 'Break-even input must come from the shared finance-aware calculation')
assert.match(service, /getApplicableDriverTarget\(/, 'The effective Admin target record must be selected for the as-of date')
assert.match(service, /deriveRollingDriverTarget\(/, 'Target calculation must use rolling active-day recovery')
assert.match(service, /resolveDriverTargetAuthority\(/, 'All target-facing output must pass through the shared authority resolver')
assert.match(repository, /db\.transaction\(\[\.\.\.PERFORMANCE_STORES\], 'readonly'\)/, 'Snapshot stores must be read within one IndexedDB read transaction')
assert.match(repository, /tx\.oncomplete = \(\) => resolve\(result\)/, 'Snapshot must resolve only after the read transaction completes')
assert.match(stabilization, /shift\.revenue\)/, 'Rolling recovery must use authoritative shift revenue')
assert.match(stabilization, /COMPLETED_SHIFT_REVENUE_AND_SHIFTS_FOR_ACTIVE_DAYS/, 'The rolling authority must be explicit')
assert.match(stabilization, /Math\.max\(0, baseDaily \+ balance\)/, 'Displayed rolling target must never become negative')
assert.match(authority, /MISSING_AUTHORITATIVE_TARGET_INPUT/, 'Missing target inputs must remain unavailable rather than be coerced to zero')
assert.match(authority, /DRIVER_TARGET_ROLLING_RECOVERY/, 'The authority resolver must identify when rolling recovery is in force')

console.log('Driver target stabilization implementation contract passed: canonical snapshot, effective Admin inputs, finance-aware break-even, and explicit rolling target authority.')
