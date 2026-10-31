import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name)
  if (entry.isDirectory()) return readFiles(target)
  return /\.(js|vue|css)$/.test(entry.name) ? [target] : []
})
const read = relative => fs.readFileSync(path.join(srcRoot, relative), 'utf8')
const violations = []

// 3A — Shell owns framing/presentation only.
const shell = read('components/shell/KfeShell.vue')
const shellScript = shell.split('<template>')[0]
for (const pattern of [/from\s+['"][^'"]*\/domain\//, /from\s+['"][^'"]*\/repositories\//, /from\s+['"][^'"]*\/infrastructure\//, /from\s+['"][^'"]*\/services\//]) {
  if (pattern.test(shellScript)) violations.push('Shell boundary violation: ' + pattern)
}
assert.match(shell, /route\.meta\?\.shell/)

// 3B — Unused generic UI primitive layer is removed; active components are screen-owned.
if (fs.existsSync(path.join(srcRoot, 'components/ui'))) violations.push('Retired generic components/ui layer must remain deleted.')

// 3C — One canonical button vocabulary.
const allSource = readFiles(path.join(srcRoot, 'views')).concat(readFiles(path.join(srcRoot, 'components'))).concat([path.join(srcRoot,'styles/kfe-ui.css')])
for (const file of allSource) {
  const source = fs.readFileSync(file, 'utf8')
  for (const pattern of [/\bbase-btn\b/, /\bbtn-(?:primary|secondary|danger|ghost|sm|md|lg)\b/, /\bbase-button\b/]) if (pattern.test(source)) violations.push('Legacy button vocabulary remains: ' + path.relative(srcRoot, file) + ' matches ' + pattern)
}
const uiCss = read('styles/kfe-ui.css')
assert.ok(uiCss.includes('--kfe-ui-bg') && uiCss.includes('--kfe-ui-surface') && uiCss.includes('--kfe-ui-text'), 'Shared UI theme tokens must remain authoritative.')

// 3D — Screen presentation stays in the canonical stylesheet.
for (const file of readFiles(path.join(srcRoot, 'views'))) {
  const source = fs.readFileSync(file, 'utf8')
  if (/<style\b/.test(source)) violations.push('View-local style block reintroduced: ' + path.relative(srcRoot, file))
  if (/(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|border-radius\s*:|(?:padding|margin|gap)\s*:)/.test(source)) violations.push('View contains raw presentation declaration: ' + path.relative(srcRoot, file))
}
for (const file of readFiles(path.join(srcRoot, 'components'))) {
  const source = fs.readFileSync(file, 'utf8')
  if (/<style\b/.test(source)) violations.push('Component-local style block reintroduced: ' + path.relative(srcRoot, file))
}

// 3E — Specialized modes may differ, but inherit the shared visual authority.
assert.ok(uiCss.includes('--kfe-ui-bg') && uiCss.includes('--kfe-ui-surface') && uiCss.includes('--kfe-ui-text'))
assert.ok(uiCss.includes('--kfe-radius-sm') && uiCss.includes('--kfe-radius-md') && uiCss.includes('--kfe-radius-lg'))
assert.ok(uiCss.includes('--kfe-space-1') && uiCss.includes('--kfe-space-7'))

if (violations.length) { console.error(violations.join('\n')); process.exit(1) }
console.log('KFE Phase 3 architecture guardrails: PASS — shell/UI boundaries, canonical controls, CSS convergence guardrails, and screen presentation boundaries are enforced.')