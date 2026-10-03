import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const gateUrl = new URL('../../tools/ui-isolation-gate.mjs', import.meta.url)
const packageUrl = new URL('../../package.json', import.meta.url)
const contractUrl = new URL('../../docs/UI-UX-SHELL-CONTRACT.md', import.meta.url)
const gatePath = new URL('../../tools/ui-isolation-gate.mjs', import.meta.url).pathname
const gate = await readFile(gateUrl, 'utf8')
const pkg = JSON.parse(await readFile(packageUrl, 'utf8'))
const contract = await readFile(contractUrl, 'utf8')

function runGate(...args) {
  return spawnSync(process.execPath, [gatePath, ...args], { encoding: 'utf8' })
}

assert.equal(pkg.scripts['ui:preflight'], 'node tools/ui-isolation-gate.mjs')
assert.match(pkg.scripts.test, /runAllContracts\.js/)
assert.match(gate, /CHANGE IMPACT WARNING/)
assert.match(gate, /BLOCKED before edit/)
assert.match(gate, /acknowledge-shared-impact/)
assert.match(gate, /all four routes/)
assert.match(contract, /npm run ui:preflight/)
assert.match(contract, /does \*\*not yet prove\*\*/)

// Positive control: a component-local candidate is not blocked by the preflight.
const local = runGate('src/views/Work.vue')
assert.equal(local.status, 0, local.stdout + local.stderr)
assert.match(local.stdout, /LOCAL CANDIDATE/)

// Negative control: business/persistence/native authority can never be labelled presentation-only.
const protectedResult = runGate('src/domain/trip.js')
assert.notEqual(protectedResult.status, 0)
assert.match(protectedResult.stderr, /protected business, persistence, or native authority/)

// Negative + acknowledgement control: shared theme surfaces block by default, then require explicit review.
const sharedBlocked = runGate('src/styles/kfe-ui.css')
assert.notEqual(sharedBlocked.status, 0)
assert.match(sharedBlocked.stderr, /BLOCKED before edit/)
const sharedAcknowledged = runGate('src/styles/kfe-ui.css', '--acknowledge-shared-impact')
assert.equal(sharedAcknowledged.status, 0, sharedAcknowledged.stdout + sharedAcknowledged.stderr)
assert.match(sharedAcknowledged.stdout, /not proof of isolation/)

console.log('UI isolation gate contract: PASS — local candidate allowed; protected layer blocked; shared theme blocked until acknowledged; acknowledgement explicitly is not proof.')
