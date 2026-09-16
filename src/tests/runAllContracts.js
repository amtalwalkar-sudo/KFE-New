import { spawnSync } from 'node:child_process'

const suites = [
  'architecture.contract.js','offlineSync.contract.js','work.contract.js','performance.contract.js','driverTargetStabilization.contract.js','driverTargetStabilization.implementation.contract.js','financialModel.contract.js','admin.contract.js','shell.contract.js','ui.contract.js','backup.contract.js','backupConfig.contract.js','erpFormCalculation.contract.js','auditMutation.contract.js','integrity.contract.js','canonicalData.contract.js','persistence.contract.js','rideCapture.contract.js','operationalRecords.contract.js','phase5CalculationPerformance.contract.js','calculationBoundary.confirmed.contract.js','calculationBoundary.adversarial.contract.js','boundaryRegression.contract.js','calculationAuthority.contract.js','calculationArithmetic.contract.js','calculationInvalidation.contract.js','phase7CapacitorAndroid.contract.js'
]

const results = []
for (const suite of suites) {
  const startedAt = Date.now()
  const result = spawnSync(process.execPath, [`src/tests/${suite}`], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })
  const output = [result.stdout, result.stderr].filter(Boolean).join('')
  const passed = result.status === 0
  results.push({ suite, passed, status: result.status, signal: result.signal, output, durationMs: Date.now() - startedAt })
  process.stdout.write(`\n=== ${passed ? 'PASS' : 'FAIL'}: ${suite} ===\n`)
  if (output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
}

const failures = results.filter(result => !result.passed)
process.stdout.write('\n=== CONTRACT FAILURE INVENTORY ===\n')
process.stdout.write(`Suites: ${results.length}\nPassed: ${results.length - failures.length}\nFailed: ${failures.length}\n`)
for (const failure of failures) process.stdout.write(`- ${failure.suite} (exit=${failure.status ?? 'null'}, signal=${failure.signal ?? 'none'})\n`)
if (failures.length > 0) {
  process.stdout.write('\n=== REQUIRED NEXT STEP ===\nInspect all failures together and group them by shared root cause before changing implementation or tests.\n')
  process.exitCode = 1
} else process.stdout.write('\nALL CONTRACT SUITES PASSED\n')
