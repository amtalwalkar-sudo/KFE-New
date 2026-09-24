import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const required = [
  'KFE_WORKING_RULES.md',
  'KFE_LAUNCH_MASTER_PLAN.md',
  'KFE_LAUNCH_STATUS.md',
  'KFE_LAUNCH_BACKLOG.md',
  'KFE_BUSINESS_RULES_REGISTER.md',
  'KFE_BUSINESS_RULES_AUDIT.md',
  'KFE_BUSINESS_RULE_DEFECTS.md'
]

const forbidden = [
  'docs/KFE-BUSINESS-RULES.md',
  'docs/KFE-DEVELOPMENT-PHASES.md'
]

const failures = []
const read = file => readFileSync(join(root, file), 'utf8')
const requireMatch = (file, pattern, message) => {
  if (!pattern.test(read(file))) failures.push(message)
}

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push('missing required Phase 0 control file: ' + file)
}
for (const file of forbidden) {
  if (existsSync(join(root, file))) failures.push('competing legacy authority still exists: ' + file)
}

if (!failures.length) {
  requireMatch('KFE_WORKING_RULES.md', /KFE_BUSINESS_RULES_REGISTER\.md is the sole authoritative source/i, 'working rules do not identify the business-rule register as sole authority')
  requireMatch('KFE_WORKING_RULES.md', /KFE_LAUNCH_MASTER_PLAN\.md — only document that defines phase sequence/i, 'working rules do not identify the master plan as sole roadmap authority')
  requireMatch('KFE_LAUNCH_MASTER_PLAN.md', /^\*\*Status:\*\* Authoritative/m, 'master plan is not marked authoritative')
  requireMatch('KFE_LAUNCH_MASTER_PLAN.md', /\| 0 \| Roadmap Control \|/, 'master plan does not contain Phase 0 Roadmap Control')
  requireMatch('KFE_LAUNCH_MASTER_PLAN.md', /\| 13 \| Final Release Gate \|/, 'master plan does not contain the current final release gate')
  const status = read('KFE_LAUNCH_STATUS.md')
  const phase0Open = /\*\*PHASE 0 — ROADMAP CONTROL\*\*/.test(status)
  const phase0Closed = /Phase 0 is \*\*CLOSED\*\*/i.test(status)
  const phase1Active = /\*\*PHASE 1 — BUSINESS RULES AUDIT\*\*/.test(status) && /Phase 1 is \*\*UNLOCKED\*\* and active/i.test(status)
  if (!phase0Open && !(phase0Closed && phase1Active)) failures.push('status does not show either the active Phase 0 state or the verified Phase 0-closed / Phase 1-active state')
  requireMatch('KFE_BUSINESS_RULES_REGISTER.md', /AUTHORITATIVE — SOLE BUSINESS-RULE AUTHORITY/, 'business-rule register is not marked sole authority')
  requireMatch('KFE_BUSINESS_RULES_AUDIT.md', /KFE_BUSINESS_RULES_REGISTER\.md/, 'business-rule audit is not bound to the register')
}

const walk = dir => {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules' || entry === 'dist' || entry === 'artifacts') continue
    const path = join(dir, entry)
    const st = statSync(path)
    if (st.isDirectory()) out.push(...walk(path))
    else if (/\.(md|mjs|js|cjs|yml|yaml)$/.test(entry)) out.push(path)
  }
  return out
}

const activeDocs = [
  'KFE_WORKING_RULES.md',
  'KFE_LAUNCH_MASTER_PLAN.md',
  'KFE_LAUNCH_STATUS.md',
  'KFE_LAUNCH_BACKLOG.md',
  'KFE_BUSINESS_RULES_REGISTER.md',
  'KFE_BUSINESS_RULES_AUDIT.md',
  'KFE_BUSINESS_RULE_DEFECTS.md'
]
const sourceFiles = walk(root).map(file => relative(root, file).replaceAll('\\\\', '/'))

for (const file of sourceFiles) {
  const text = read(file)
  if (activeDocs.includes(file) || file === 'src/tests/phase0SourceOfTruth.contract.js') continue
  const header = text.slice(0, 1200)
  const historical = /HISTORICAL|historical record|not active roadmap/i.test(header)
  if (!historical && /KFE_BUSINESS_RULES_REGISTER\.md is the sole authoritative source|sole authoritative source for KFE business|only document that defines phase sequence/i.test(text)) {
    failures.push('competing business-rule or roadmap authority claim in: ' + file)
  }
  if (!historical && /docs\/KFE-DEVELOPMENT-PHASES\.md|docs\/KFE-BUSINESS-RULES\.md/.test(text)) {
    failures.push('stale deleted-authority reference in active source: ' + file)
  }
}

if (!sourceFiles.includes('src/tests/runAllContracts.js')) failures.push('canonical grouped contract runner is missing')

if (failures.length) {
  console.error('PHASE 0 GOVERNANCE CONTRACT FAILED')
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}

console.log('PHASE 0 GOVERNANCE CONTRACT PASSED')
console.log('One business-rule authority, one roadmap authority, one active phase controller, and no legacy competing authority files.')
