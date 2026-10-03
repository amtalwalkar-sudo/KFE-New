import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const contractUrl = new URL('../../docs/UI-UX-SHELL-CONTRACT.md', import.meta.url)
const shellUrl = new URL('../components/shell/KfeShell.vue', import.meta.url)
const baselineUrl = new URL('../../KFE_WORK_COCKPIT_BASELINE.md', import.meta.url)
const runnerUrl = new URL('./runAllContracts.js', import.meta.url)
const impactUrl = new URL('../../tools/presentation-impact.mjs', import.meta.url)
const packageUrl = new URL('../../package.json', import.meta.url)

const contract = await readFile(contractUrl, 'utf8')
const shell = await readFile(shellUrl, 'utf8')
const baseline = await readFile(baselineUrl, 'utf8')
const runner = await readFile(runnerUrl, 'utf8')
const impactTool = await readFile(impactUrl, 'utf8')
const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'))

const requiredHeadings = [
  'Architecture boundaries',
  'Shell ownership rules',
  'Screen ownership rules',
  'UI component ownership rules',
  'Navigation',
  'Viewport / safe-area / keyboard',
  'Scrolling',
  'Overlays',
  'Theme',
  'Responsive behavior',
  'Accessibility',
  'Loading / empty / error states',
  'Interaction and gesture rules',
  'Work cockpit-specific rules',
  'Forbidden coupling',
  'Automated decoupling tests',
  'UI verification matrix',
  'E2E verification matrix'
]
const headings = contract.split('\n').filter(line => line.startsWith('## '))
for (const heading of requiredHeadings) {
  assert.ok(headings.some(line => line.includes(heading)), `Missing source-of-truth section: ${heading}`)
}

for (const obsolete of [
  '../../KFE_VISUAL_DNA.md',
  '../../docs/KFE-PRESENTATION-BOUNDARY.md',
  '../../docs/KFE-SCREEN-CONTRACT.md'
]) {
  await assert.rejects(access(new URL(obsolete, import.meta.url)), `Obsolete scattered contract still exists: ${obsolete}`)
}

assert.match(baseline, /docs\/UI-UX-SHELL-CONTRACT\.md/)
assert.match(runner, /uiUxShellDecoupling\.contract\.js/)
assert.equal(packageJson.scripts['ui:impact'], 'node tools/presentation-impact.mjs')
assert.match(impactTool, /PROTECTED_PREFIXES/)
assert.match(impactTool, /CHANGE IMPACT WARNING/)
assert.match(contract, /current impact tool is a local import-dependency check/)

// Shell may own routing and platform-level GPS status, but not business state,
// business calculations, direct persistence or screen-store orchestration.
assert.match(shell, /<router-view|<slot/)
assert.match(shell, /<router-link/)
assert.doesNotMatch(shell, /indexedDB|localStorage|useShiftTripStore|WorkService|PerformanceService|LoanService|calculateProfit|calculateEmi/i)
assert.doesNotMatch(shell, /from ['"][^'"]*(?:\/domain\/|\/repositories\/|\/infrastructure\/)/)

console.log('UI/UX shell decoupling contract: PASS — one authority, obsolete rules removed, shell boundary checked, impact-warning workflow retained.')
