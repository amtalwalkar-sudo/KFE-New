import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const adminForm = read('../components/admin/AdminSourceForm.vue')
const adminView = read('../views/AdminView.vue')
const timeline = read('../views/TimelineView.vue')
const workView = read('../views/WorkModuleView.vue')
const drafts = read('../repositories/formDraftRepository.js')

const failures = []
const check = (name, fn) => {
  try { fn(); console.log('PASS', name) }
  catch (error) { failures.push({ name, message: error.message }); console.error('FAIL', name, '-', error.message.split('\\n')[0]) }
}

// Regression expectations derived from the form-by-form audit. These checks
// intentionally run before product changes so CI records the current gaps.
check('Admin source forms restore and persist parent-scoped drafts', () => {
  assert.match(adminForm, /draftIdentity/, 'AdminSourceForm must receive a stable draft identity')
  assert.match(adminForm, /FormDraftService|WorkDraftService|FormDraftRepository/, 'AdminSourceForm must use the shared draft boundary')
  assert.match(adminForm, /restoreDraft|restoreFormDraft|\.get\(/, 'AdminSourceForm must restore an existing draft')
  assert.match(adminForm, /saveDraft|saveFormDraft|\.save\(/, 'AdminSourceForm must persist edits before commit')
})
check('Admin draft clearing is tied to successful parent save', () => {
  assert.match(adminView, /clearCommittedDraft|clearFormDraft|confirmedDiscard/, 'Admin parent must clear a draft only after save success or confirmed discard')
  assert.match(adminView, /await\s+AdminService\.save/, 'Admin parent must await canonical save completion before clearing draft')
})
check('Timeline trip and fuel edits survive dismissal and restart', () => {
  assert.match(timeline, /FormDraftService|WorkDraftService|FormDraftRepository/, 'Timeline editors must use the shared draft boundary')
  assert.match(timeline, /watch\(|saveDraft|saveFormDraft/, 'Timeline editor changes must persist drafts')
  assert.doesNotMatch(timeline, /@click\.self="editing=null"/, 'Backdrop must not silently discard an unfinished trip edit')
})
check('Work draft writes cannot race commit-time clearing', () => {
  assert.doesNotMatch(workView, /void saveDraft\(/, 'Draft writes must be serialized/awaitable, not fire-and-forget')
  assert.match(workView, /flushDraft|awaitDraftWrites|draftWriteQueue|serializeDraft/, 'Commit must wait for pending draft writes before clearing')
  assert.doesNotMatch(workView, /const clearCommittedDraft = async identity => \{\s*try \{ await WorkDraftService\.clear\(identity, \{ committed: true \}\) \} catch \(_) \{\} \}/, 'Draft-clear failures must be surfaced or reconciled rather than silently swallowed')
})

if (failures.length) {
  console.error('Universal Form Draft Recovery Regression Contract: FAIL')
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
} else {
  console.log('Universal Form Draft Recovery Regression Contract: PASS')
}
