import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const canonicalAuthorities = new Set([
  'KFE-AUTHORITY-MAP.md',
  'KFE_BUSINESS_RULES_REGISTER.md',
  'docs/KFE-ARCHITECTURE-CONTRACT.md',
  'docs/KFE-CALCULATION-SPECIFICATION.md',
  'docs/KFE-CANONICAL-DATA-CONTRACT.md',
  'docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md',
  'docs/UI-UX-SHELL-CONTRACT.md',
  'KFE_LAUNCH_MASTER_PLAN.md',
])

const requiredAuthorities = [
  'KFE-AUTHORITY-MAP.md',
  'KFE_BUSINESS_RULES_REGISTER.md',
  'docs/KFE-ARCHITECTURE-CONTRACT.md',
  'docs/KFE-CALCULATION-SPECIFICATION.md',
  'docs/KFE-CANONICAL-DATA-CONTRACT.md',
  'docs/KFE-OPERATIONAL-LIFECYCLE-CONTRACT.md',
  'docs/UI-UX-SHELL-CONTRACT.md',
  'KFE_LAUNCH_MASTER_PLAN.md',
]

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(absolute)
    return absolute.endsWith('.md') ? [absolute] : []
  })
}

for (const relative of requiredAuthorities) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `missing canonical authority: ${relative}`)
}

const retired = [
  'docs/CURRENT-BUSINESS-CALCULATION-AUTHORITY.md',
  'KFE_VISUAL_DNA.md',
  'docs/KFE-PRESENTATION-BOUNDARY.md',
  'docs/KFE-SCREEN-CONTRACT.md',
]
for (const relative of retired) {
  assert.equal(fs.existsSync(path.join(root, relative)), false, `retired competing authority still exists: ${relative}`)
}

const offenders = []
for (const file of walk(root)) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/')
  const content = fs.readFileSync(file, 'utf8')
  if (/\*\*Status:\*\*\s*AUTHORITATIVE\b/i.test(content) && !canonicalAuthorities.has(relative)) {
    offenders.push(relative)
  }
}
assert.deepEqual(offenders, [], `non-canonical Markdown declares AUTHORITATIVE: ${offenders.join(', ')}`)

const map = fs.readFileSync(path.join(root, 'KFE-AUTHORITY-MAP.md'), 'utf8')
for (const relative of requiredAuthorities) {
  assert.ok(map.includes(relative), `authority map does not list canonical authority: ${relative}`)
}

console.log('PASS: single-authority governance map and duplicate-authority guardrails are present')
