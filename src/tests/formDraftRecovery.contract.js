import assert from 'node:assert/strict'
import fs from 'node:fs'
import { formDraftIdentity, isFormDraftClearAuthorized } from '../repositories/formDraftRepository.js'

const trip = formDraftIdentity({
  formId: 'work-fare', workflowStep: 'ENTER_FARE', parentType: 'TRIP',
  parentId: 'trip-1', ownerId: 'shift-1'
})
const sameTrip = formDraftIdentity({
  formId: 'work-fare', workflowStep: 'ENTER_FARE', parentType: 'TRIP',
  parentId: 'trip-1', ownerId: 'shift-1'
})
const otherTrip = formDraftIdentity({
  formId: 'work-fare', workflowStep: 'ENTER_FARE', parentType: 'TRIP',
  parentId: 'trip-2', ownerId: 'shift-1'
})
const otherShift = formDraftIdentity({
  formId: 'work-fare', workflowStep: 'ENTER_FARE', parentType: 'TRIP',
  parentId: 'trip-1', ownerId: 'shift-2'
})
assert.equal(trip.id, sameTrip.id, 'Same form and parent identity must restore the same draft')
assert.notEqual(trip.id, otherTrip.id, 'Trip draft identity must not leak into another Trip')
assert.notEqual(trip.id, otherShift.id, 'Trip draft identity must remain scoped to its owning Shift')
assert.notEqual(trip.id, formDraftIdentity({
  formId: 'work-fare', workflowStep: 'REVIEW', parentType: 'TRIP',
  parentId: 'trip-1', ownerId: 'shift-1'
}).id, 'Workflow step must be part of draft identity')
assert.throws(() => formDraftIdentity({ formId: 'work-fare', workflowStep: 'ENTER_FARE', parentType: 'TRIP', parentId: 'trip-1' }), /owning Shift/)
assert.throws(() => formDraftIdentity({ formId: 'work-start', workflowStep: 'START', parentType: 'WORKFLOW' }), /temporary workflow ID/)
assert.equal(isFormDraftClearAuthorized(), false, 'Draft must not clear on navigation or implicit abandonment')
assert.equal(isFormDraftClearAuthorized({ committed: true }), true, 'Successful commit may clear draft')
assert.equal(isFormDraftClearAuthorized({ confirmedDiscard: true }), true, 'Explicit confirmed discard may clear draft')

const db = fs.readFileSync('src/utils/indexedDB.js', 'utf8')
const repository = fs.readFileSync('src/repositories/formDraftRepository.js', 'utf8')
assert.match(db, /createSimpleStore\(db, 'form_drafts'/, 'Drafts need a dedicated non-canonical store')
assert.match(repository, /tx\.objectStore\('form_drafts'\)\.put\(record\)/, 'Draft persistence must not write canonical business entities')
assert.match(repository, /Form draft can only be cleared after successful commitment or explicit confirmed discard/, 'Clear must enforce the frozen recovery rule')
assert.match(repository, /record\.ownerId !== identity\.ownerId/, 'Restore must verify parent ownership scope')
assert.match(repository, /record\.workflowStep !== identity\.workflowStep/, 'Restore must verify workflow-step identity')

console.log('Universal parent-scoped form draft recovery contract passed.')
