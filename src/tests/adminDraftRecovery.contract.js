import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const adminView = read('../views/AdminView.vue')
const adminForm = read('../components/admin/AdminSourceForm.vue')
const draftRepository = read('../repositories/formDraftRepository.js')
const draftService = read('../application/forms/formDraftService.js')

assert.match(adminView, /FormDraftService\.newWorkflowId\(\)/, 'Each new Admin workflow needs a fresh workflow ID.')
assert.match(adminView, /FormDraftService\.latestWorkflow\('admin-' \+ formId, workflowStep, parentType, parentId\)/, 'Admin must resume a matching unfinished workflow after reload.')
assert.match(adminView, /draftWorkflowKey = \(formId, workflowStep, parentId = null\)/, 'Workflow IDs must be scoped by form, step and parent.')
assert.match(adminView, /workflowId\s*\n\s*\}/, 'Every active Admin draft identity must include its workflow ID.')
assert.match(draftRepository, /async latestWorkflow\(formId, workflowStep, parentType = 'WORKFLOW', parentId = null\)/, 'Workflow lookup must support parent-scoped actions.')
assert.match(draftRepository, /parentId \? item\.parentId === String\(parentId\) : Boolean\(item\.workflowId\) && !item\.parentId/, 'Parent-scoped workflow lookup must not cross record boundaries.')
assert.match(draftService, /latestWorkflow: \(formId, step, parentType, parentId = null\)/, 'The application draft service must forward parent scope.')
assert.match(adminForm, /const formElement = ref\(null\)/, 'Admin form focus must be local to its own instance.')
assert.match(adminForm, /formElement\.value\?\.querySelector\(/, 'Autofocus must not select a different Admin form.')
assert.doesNotMatch(adminForm, /document\.querySelector\('\.admin-source-form'\)/, 'Global document lookup can focus the wrong form.')
assert.match(adminForm, /if \(props\.busy \|\| submitting\) return/, 'Repeated form submissions must be blocked while saving.')
for (const fn of ['saveTarget','saveMaintenanceRate','saveLoanPayment','saveSourcePayment']) {
  assert.match(adminView, new RegExp('async function ' + fn + '\\(\\)\\{if\\(loading\\.value\\)return;'), fn + ' must reject duplicate in-flight submits.')
}
assert.match(adminView, /async function save\(values\)\{if\(saving\.value\)return;/, 'Create/edit commits must reject duplicate in-flight submits.')
assert.match(adminView, /async function recordPrepayment\(\)\{if\(loading\.value\|\|!prepaymentEstimate\.value\?\.available/, 'Prepayment commits must reject duplicate in-flight submits.')
console.log('Admin draft recovery contract passed: unique workflow identities, reload recovery, parent isolation, local focus and duplicate-submit guards.')
