import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const tool = new URL('../../tools/presentation-impact.mjs', import.meta.url)
const boundary = new URL('../../docs/KFE-PRESENTATION-BOUNDARY.md', import.meta.url)
const packageFile = new URL('../../package.json', import.meta.url)

await access(tool)
await access(boundary)

const packageJson = JSON.parse(await readFile(packageFile, 'utf8'))
assert.equal(packageJson.scripts['ui:impact'], 'node tools/presentation-impact.mjs')

const boundaryText = await readFile(boundary, 'utf8')
assert.match(boundaryText, /Presentation change impact warning — permanent rule/)
assert.match(boundaryText, /npm run ui:impact -- <src\/path>/)
assert.match(boundaryText, /🔴 CHANGE IMPACT WARNING/)

const toolText = await readFile(tool, 'utf8')
assert.match(toolText, /PROTECTED_PREFIXES/)
assert.match(toolText, /PRESENTATION_PREFIXES/)
assert.match(toolText, /CHANGE IMPACT WARNING/)
assert.match(toolText, /process\.exitCode = 1/)

console.log('Presentation impact contract passed: presentation changes have a permanent dependency-warning guard.')
