import { spawn } from 'node:child_process'

const gates = [
  ['persistence', ['tools/phase4-persistence-recovery.mjs'], 'PASS Phase 4 Persistence & Recovery'],
  ['isolation', ['tools/phase4-synthetic-canonical-isolation.mjs'], 'PASS Phase 4 Synthetic ↔ Canonical Repository Isolation'],
  ['boundaryContinuity', ['tools/phase4-boundary-continuity.mjs'], 'PASS Phase 4 boundary/continuity executable coverage'],
  ['operationalGaps', ['tools/phase4-operational-gap-suite.mjs'], 'PASS Phase 4 operational gap suite'],
]

const run = (label, args) => new Promise((resolve, reject) => {
  const child = spawn('node', args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString() })
  child.stderr.on('data', chunk => { output += chunk.toString() })
  child.on('error', reject)
  child.on('close', code => {
    if (code !== 0) reject(new Error(label + ' failed (exit ' + code + ')\n' + output))
    resolve(output)
  })
})

const results = {}
for (const [name, args, expected] of gates) {
  const output = await run(name, args)
  if (!output.includes(expected)) {
    throw new Error(name + ' did not emit its expected evidence marker.\n' + output)
  }
  results[name] = 'PASS'
}

console.log('KFE_CORE_AUTOMATED_MATRIX_RESULT ' + JSON.stringify({
  scope: 'Only retained persistence, repository isolation, boundary continuity, and operational workflow checks are included. Retired lifecycle/calculation scenarios are intentionally excluded; native overlay behavior is covered by the Android exact-APK gate.',
  counts: { total: gates.length, pass: gates.length, failed: 0 },
  gates: results,
}, null, 2))
