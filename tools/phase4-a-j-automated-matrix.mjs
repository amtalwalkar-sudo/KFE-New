import { spawn } from 'node:child_process'

const child = spawn('node', ['tools/phase4-persistence-recovery.mjs'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
})
let output = ''
child.stdout.on('data', chunk => { output += chunk.toString() })
child.stderr.on('data', chunk => { output += chunk.toString() })

const exitCode = await new Promise((resolve, reject) => {
  child.on('error', reject)
  child.on('close', resolve)
})
if (exitCode !== 0) {
  throw new Error('Core persistence gate failed (exit ' + exitCode + ')\n' + output)
}
if (!output.includes('PASS Phase 4 Persistence & Recovery')) {
  throw new Error('Core persistence gate did not emit its expected evidence marker.\n' + output)
}

console.log('KFE_CORE_AUTOMATED_MATRIX_RESULT ' + JSON.stringify({
  scope: 'This retained gate verifies durable canonical persistence, idempotent retry, interrupted-write handling, recovery, and browser-restart survival. Retired cross-surface lifecycle and complex calculation scenarios are excluded.',
  counts: { total: 1, pass: 1, failed: 0 },
  gates: { persistenceAndRecovery: 'PASS' },
}, null, 2))
