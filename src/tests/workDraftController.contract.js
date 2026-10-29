import assert from 'node:assert/strict'
import { createWorkDraftController } from '../application/work/workDraftController.js'

const identity = { formId: 'work-fuel', workflowStep: 'RECORD_FUEL', parentType: 'SHIFT', parentId: 'shift-1' }
const calls = []
let releaseFirst
const firstGate = new Promise(resolve => { releaseFirst = resolve })
const service = {
  async get(key) { calls.push(['get', key]); return { values: { amount: '10' } } },
  async save(key, values) {
    calls.push(['save:start', values.amount])
    if (values.amount === 'first') await firstGate
    calls.push(['save:end', values.amount])
  },
  async clear(key, options) { calls.push(['clear', options]) },
}
let restoring = false
const failures = []
const controller = createWorkDraftController({ service, isRestoring: () => restoring, onFailure: message => failures.push(message) })

assert.deepEqual(await controller.restore(identity), { values: { amount: '10' } })
restoring = true
await controller.save(identity, { amount: 'ignored-during-restore' })
restoring = false
const first = controller.save(identity, { amount: 'first' })
const second = controller.save(identity, { amount: 'second' })
const clear = controller.clearCommitted(identity)
releaseFirst()
await Promise.all([first, second, clear])
await controller.save(identity, { amount: 'must-not-resurrect-committed-draft' })
assert.deepEqual(calls.filter(call => call[0] === 'save:start').map(call => call[1]), ['first', 'second'])
assert.deepEqual(calls.filter(call => call[0] === 'save:end').map(call => call[1]), ['first', 'second'])
assert.equal(calls.filter(call => call[0] === 'clear').length, 1)
assert.deepEqual(failures, [])

const failing = createWorkDraftController({
  service: { ...service, async get() { throw new Error('read failed') }, async save() { throw new Error('disk full') } },
  onFailure: message => failures.push(message),
})
assert.equal(await failing.restore(identity), null)
await failing.save(identity, { amount: '20' })
assert.equal(failures.length, 1)
assert.match(failures[0], /Draft could not be saved locally/)

console.log('PASS: Work draft persistence is serialized, restore-safe, and cannot resurrect a committed draft')
