import { spawn } from 'node:child_process'

const commands = [
  ['persistence', 'node', ['tools/phase4-persistence-recovery.mjs']],
  ['lifecycle', 'node', ['tools/phase4-cross-surface-lifecycle.mjs']],
  ['runtime', 'node', ['tools/phase4-runtime-visual-smoke.mjs']],
  ['isolation', 'node', ['tools/phase4-synthetic-canonical-isolation.mjs']],
  ['boundaryContinuity', 'node', ['tools/phase4-boundary-continuity.mjs']],
  ['operationalGaps', 'node', ['tools/phase4-operational-gap-suite.mjs']],
]

const run = (label, command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  child.on('error', reject)
  child.on('close', code => {
    if (code !== 0) reject(new Error(label + ' failed (exit ' + code + ')\\n' + output))
    else resolve(output)
  })
})

const matrix = [
  ['A1','PASS','Cross-surface executable gate verifies valid shift start and persisted ACTIVE state.'],
  ['A2','PASS','Cross-surface executable gate verifies trip completion and revenue.'],
  ['A3','PASS','Cross-surface lifecycle fixture exercises ordered completed/cancelled trips in one shift.'],
  ['A4','PASS','Cross-surface executable gate verifies shift close, closing odometer and authoritative revenue.'],
  ['A5','PASS','Operational gap suite verifies the CNG refuel control opens while OFFLINE.'],
  ['B1','PASS','Runtime gate verifies start-odometer gate and visible recovery path.'],
  ['B2','PASS','Boundary/continuity executable gate asserts valid and invalid Personal-KM/Dead-KM allocation.'],
  ['B3','PASS','Boundary/continuity executable gate blocks shift end while an active trip exists and preserves active state.'],
  ['B4','PASS','Runtime gate verifies Back from start-odometer flow without a write.'],
  ['B5','PASS','Cross-surface gate verifies cancellation persistence and exclusion from ride count/revenue/KM.'],
  ['B6','PASS','Boundary/continuity executable gate asserts duplicate terminal completion creates no second mutation.'],
  ['C1','DEFERRED','Android overlay execution surface; physical/native execution is Phase 5/device scope.'],
  ['C2','DEFERRED','Android overlay execution surface; physical/native execution is Phase 5/device scope.'],
  ['C3','DEFERRED','Android overlay execution surface; physical/native execution is Phase 5/device scope.'],
  ['C4','DEFERRED','Android overlay process/background behavior requires native execution.'],
  ['C5','DEFERRED','Android overlay bubble/minimize/reopen requires native execution.'],
  ['D1','PASS','Persistent-browser restart plus repository reread verifies state recovery.'],
  ['D2','PASS','Operational gap suite performs and rereads a canonical Work shift mutation while the browser is offline.'],
  ['D3','PASS','Timeline rendering is verified from canonical lifecycle records.'],
  ['D4','PASS','Performance rendering/reconciliation is verified from canonical lifecycle records.'],
  ['D5','NOT_EXECUTED','Admin master-data edit followed by Work consumption is not part of the current executable gate.'],
  ['E1','DEFERRED','PWA↔Android-overlay mixed-surface execution requires native overlay runtime.'],
  ['E2','DEFERRED','PWA↔Android-overlay mixed-surface execution requires native overlay runtime.'],
  ['E3','DEFERRED','Repeated PWA↔overlay switching requires native overlay runtime.'],
  ['E4','PASS','Post-completion Timeline/Performance reconciliation is executable in the PWA.'],
  ['F1','NOT_EXECUTED','Backgrounding an active ride is not equivalent to browser reload and needs a dedicated lifecycle test.'],
  ['F2','DEFERRED','Force-stop behavior is Android/device-specific.'],
  ['F3','DEFERRED','Screen lock/unlock behavior is Android/device-specific.'],
  ['F4','PASS','Stale SYNCING mutation recovery and persistent restart are executable and asserted.'],
  ['F5','PASS','Operational gap suite restores connectivity and verifies the same canonical active shift survives reload.'],
  ['G1','PASS','Runtime gate supplies geolocation and verifies GPS control behavior.'],
  ['G2','PASS','Operational gap suite explicitly exercises denied geolocation permission state.'],
  ['G3','PASS','Operational gap suite explicitly exercises geolocation-unavailable degraded state.'],
  ['G4','PASS','Operational gap suite restores GPS permission and asserts no GPS snapshot is created by status recovery.'],
  ['G5','PASS','Driver-facing lifecycle evidence uses place names while canonical location data remains persisted.'],
  ['H1','PASS','Shift-authoritative revenue reconciles with completed-trip revenue in the lifecycle fixture.'],
  ['H2','PASS','Boundary/continuity executable gate reconciles separate daily Timeline totals to shift authority.'],
  ['H3','PASS','Fuel repository persistence/idempotency path is executed; amount/quantity inputs are preserved.'],
  ['H4','NOT_EXECUTED','Maintenance/loan/target outputs are outside the current executable Phase 4 gate.'],
  ['H5','PASS','Timeline and Performance consume the same canonical lifecycle fixture and reconcile.'],
  ['I1','PASS','Boundary/continuity executable gate closes one day and persists the next completed day.'],
  ['I2','PASS','Boundary/continuity executable gate asserts next-day opening odometer equals prior closing odometer.'],
  ['I3','PASS','Boundary/continuity executable gate reconciles two-day financial total without double counting.'],
  ['I4','PASS','Persistent reload/restart preserves canonical historical repository records.'],
  ['I5','NOT_EXECUTED','Business Start Date boundary is not separately executed here.'],
  ['J1','PASS','Boundary/continuity executable gate preserves a zero-value completed ride/day.'],
  ['J2','PASS','Boundary/continuity executable gate accepts and persists same opening/closing odometer.'],
  ['J3','PASS','Boundary/continuity executable gate requires confirmation for >500 km and then closes successfully.'],
  ['J4','PASS','Boundary/continuity executable gate asserts an IST-midnight trip remains on its start reporting day.'],
  ['J5','NOT_EXECUTED','Business Start Date before/on/after boundary is not separately executed here.'],
  ['J6','PASS','Runtime/cross-surface fixtures preserve location only when supplied and use place names in driver-facing UI.'],
  ['J7','PASS','Persistent restart plus idempotent fuel retry verifies no duplicate repository record across reopen/retry.'],
]

const outputs = {}
for (const [label, command, args] of commands) outputs[label] = await run(label, command, args)

const executable = matrix.filter(([, status]) => status === 'PASS').length
const deferred = matrix.filter(([, status]) => status === 'DEFERRED').length
const notExecuted = matrix.filter(([, status]) => status === 'NOT_EXECUTED').length

console.log('PHASE4_AJ_MATRIX_RESULT ' + JSON.stringify({
  rule: 'PASS only when executable evidence exists; Android/native-only scenarios are DEFERRED; gaps remain NOT_EXECUTED.',
  counts: { total: matrix.length, pass: executable, deferred, notExecuted },
  matrix,
  gates: {
    persistence: outputs.persistence.includes('PASS Phase 4 Persistence & Recovery'),
    lifecycle: outputs.lifecycle.includes('PASS Phase 4 Item 4 Cross-surface lifecycle'),
    runtime: outputs.runtime.includes('Phase 4 runtime visual verification PASS'),
    isolation: outputs.isolation.includes('PASS Phase 4 Synthetic ↔ Canonical Repository Isolation'),
    boundaryContinuity: outputs.boundaryContinuity.includes('PASS Phase 4 boundary/continuity executable coverage'),
    operationalGaps: outputs.operationalGaps.includes('PASS Phase 4 operational gap suite'),
  },
}, null, 2))
