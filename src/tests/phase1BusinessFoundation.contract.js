import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADMIN_FORM_DEFINITIONS, ADMIN_FORM_KEYS } from '../application/admin/adminFormDefinitions.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

const suites = [
  'admin.contract.js',
  'erpFormCalculation.contract.js',
  'financeAuthority.contract.js',
  'loanFinanceE2E.contract.js',
  'canonicalData.contract.js',
  'integrity.contract.js',
  'calculationAuthority.contract.js',
  'driverTargetStabilization.contract.js',
  'driverTargetStabilization.implementation.contract.js',
  'fah4HistoricalIntegrity.contract.js',
]

const results = suites.map(suite => {
  const result = spawnSync(process.execPath, [`src/tests/${suite}`], { cwd: root, encoding: 'utf8' })
  return { suite, passed: result.status === 0, output: [result.stdout, result.stderr].filter(Boolean).join('') }
})

const failures = results.filter(result => !result.passed)
for (const result of results) {
  process.stdout.write(`[${result.passed ? 'PASS' : 'FAIL'}] ${result.suite}\n`)
  if (result.output) process.stdout.write(result.output.endsWith('\n') ? result.output : `${result.output}\n`)
}

const formFields = key => new Set(ADMIN_FORM_DEFINITIONS[key]?.fields?.map(field => field.key) || [])
const hasField = (key, field) => formFields(key).has(field)

const gaps = []
if (!ADMIN_FORM_KEYS.includes('businessSetup') && !ADMIN_FORM_KEYS.includes('business')) gaps.push('BR-01: no authoritative Admin business-configuration form is present in ADMIN_FORM_DEFINITIONS.')
if (![...ADMIN_FORM_KEYS].some(key => hasField(key, 'businessStartDate'))) gaps.push('BR-01: no authoritative business-start-date input is present in the Admin source-record definitions.')
if (![...ADMIN_FORM_KEYS].some(key => ['openingBalance', 'openingCash', 'openingBankBalance'].some(field => hasField(key, field)))) gaps.push('BR-01: no authoritative opening-balance input is present in the Admin source-record definitions.')
if (![...ADMIN_FORM_KEYS].some(key => /historical/i.test(key) || /pre.?business/i.test(key))) gaps.push('BR-01: no dedicated authoritative historical/pre-business expense source form is present in the Admin form definitions; existing historical recovery logic is not itself an input channel.')
if (!hasField('vehicle', 'openingOdometerKm')) gaps.push('BR-01: vehicle opening odometer input is missing.')
if (!hasField('driver', 'name')) gaps.push('BR-01: driver setup input is missing.')
if (!hasField('driverTarget', 'desiredDriverProfit')) gaps.push('BR-01: driver target setup input is missing.')
if (!hasField('loan', 'principal')) gaps.push('BR-01: loan setup input is missing.')
if (!hasField('maintenance', 'cost')) gaps.push('BR-01: maintenance setup/input is missing.')
if (!hasField('compliance', 'cost')) gaps.push('BR-01: compliance setup/input is missing.')

process.stdout.write('\n=== BR-01 AUDIT FINDINGS ===\n')
if (!gaps.length) process.stdout.write('No source-definition gaps detected by this deterministic audit.\n')
for (const gap of gaps) process.stdout.write(`- ${gap}\n`)
process.stdout.write('\n=== BR-01 AUDIT RESULT ===\n')
process.stdout.write(`Deterministic suites: ${results.length - failures.length}/${results.length} passed.\n`)
process.stdout.write(`Confirmed source-definition gaps: ${gaps.length}.\n`)
process.stdout.write(gaps.length ? 'BATCH RESULT: DEFECTS FOUND — remain in Phase 1 until recorded and later fixed/re-audited.\n' : 'BATCH RESULT: NO GAPS FOUND BY THIS CONTRACT — continue evidence audit.\n')
if (failures.length) process.exitCode = 1
