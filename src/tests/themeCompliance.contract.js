import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const tool = new URL('../../tools/theme-compliance-audit.mjs', import.meta.url)
const packageFile = new URL('../../package.json', import.meta.url)
const runnerFile = new URL('./runAllContracts.js', import.meta.url)

await readFile(tool, 'utf8')
const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
const runner = await readFile(runnerFile, 'utf8')
assert.equal(pkg.scripts['ui:theme-audit'], 'node tools/theme-compliance-audit.mjs')
assert.match(runner, /themeCompliance.contract.js/)

const result = spawnSync(process.execPath, [tool.pathname], { encoding: 'utf8' })
assert.equal(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /THEME COMPLIANCE AUDIT: PASS/)

console.log('Theme compliance contract: PASS — canonical theme is enforced across the PWA presentation layer.')
