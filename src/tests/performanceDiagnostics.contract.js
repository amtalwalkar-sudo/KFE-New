import assert from 'node:assert/strict'
import { getPerformanceDiagnostics } from '../domain/performance/performanceDiagnostics.js'

const missingBreakEven = {
  completeness: { breakEven: false },
  calculationEvidence: { breakEven: { status:'UNAVAILABLE', reason:'NO_APPLICABLE_BREAK_EVEN_INPUT' } },
  breakEvenTrace: { firstMissing:'input' },
  driverTargetAvailable: false,
  driverTargetReason: 'MISSING_AUTHORITATIVE_TARGET_INPUT',
  dailyBreakEven: { status:'UNAVAILABLE' },
  monthlyBreakEvenRevenue: null,
  maintenanceProvision: NaN,
}

const diagnostics = getPerformanceDiagnostics(missingBreakEven)
assert.equal(diagnostics.breakEven.rootCause, 'Break-even input')
assert.equal(diagnostics.breakEven.status, 'UNAVAILABLE')
assert.equal(diagnostics.breakEven.target.selected, 'breakEvenInputs')
assert.equal(diagnostics.target.status, 'BLOCKED')
assert.equal(diagnostics.target.blockedBy, 'Monthly Break-even')
assert.deepEqual(diagnostics.target.chain, ['Break-even Input','Monthly Break-even','Monthly Target Base','Remaining Target Obligation','Current Daily Driver Target'])
assert.equal(diagnostics.dailyBreakEven.status, 'BLOCKED')
assert.equal(diagnostics.dailyBreakEven.rootCause, 'Break-even input')
assert.equal(diagnostics.provision.status, 'BLOCKED')

const complete = {
  completeness: { breakEven: true },
  calculationEvidence: { breakEven: { status:'AUTHORITATIVE', reason:null } },
  breakEvenTrace: { firstMissing:null },
  driverTargetAvailable: true,
  dailyBreakEven: { status:'AUTHORITATIVE' },
  monthlyBreakEvenRevenue: 1000,
  maintenanceProvision: 100,
}
assert.deepEqual(getPerformanceDiagnostics(complete), {})

const missingTargetOnly = {
  completeness: { breakEven: true },
  calculationEvidence: { breakEven: { status:'AUTHORITATIVE', reason:null }, target:{ reason:'MISSING_AUTHORITATIVE_TARGET_INPUT' } },
  breakEvenTrace: { firstMissing:null },
  driverTargetAvailable: false,
  driverTargetReason: 'MISSING_AUTHORITATIVE_TARGET_INPUT',
  dailyBreakEven: { status:'AUTHORITATIVE' },
  monthlyBreakEvenRevenue: 1000,
  maintenanceProvision: 100,
}
const targetOnly = getPerformanceDiagnostics(missingTargetOnly)
assert.equal(targetOnly.target.rootCause, 'Driver Target input')
assert.equal(targetOnly.target.status, 'UNAVAILABLE')
assert.equal(targetOnly.target.target.selected, 'driverTarget')
assert.equal(targetOnly.breakEven, undefined)

console.log('KFE Performance diagnostics contract tests: PASS')
