import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const gateUrl = new URL('../../tools/ui-isolation-gate.mjs', import.meta.url)
const packageUrl = new URL('../../package.json', import.meta.url)
const contractUrl = new URL('../../docs/UI-UX-SHELL-CONTRACT.md', import.meta.url)
const gate = await readFile(gateUrl, 'utf8')
const pkg = JSON.parse(await readFile(packageUrl, 'utf8'))
const contract = await readFile(contractUrl, 'utf8')

assert.equal(pkg.scripts['ui:preflight'], 'node tools/ui-isolation-gate.mjs')
for (const prefix of ['src/domain/', 'src/application/', 'src/repositories/', 'src/infrastructure/', 'src/utils/indexedDB.js']) {
  assert.ok(gate.includes(prefix), `Preflight must protect ${prefix}`)
}
for (const prefix of ['src/styles/', 'src/assets/styles/', 'src/components/shell/', 'src/components/ui/']) {
  assert.ok(gate.includes(prefix), `Preflight must classify shared surface ${prefix}`)
}
assert.match(gate, /CHANGE IMPACT WARNING/)
assert.match(gate, /BLOCKED before edit/)
assert.match(gate, /acknowledge-shared-impact/)
assert.match(gate, /all four routes/)
assert.match(contract, /npm run ui:preflight/)
assert.match(contract, /does \*\*not yet prove\*\*/)

console.log('UI isolation preflight contract: PASS — protected/shared changes are warned and shared changes require explicit acknowledgement.')
