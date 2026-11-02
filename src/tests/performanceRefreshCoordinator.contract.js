import assert from 'node:assert/strict'
import { createCoalescedRefresh } from '../application/performance/performanceRefreshCoordinator.js'

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

const first = deferred()
let calls = 0
const coordinator = createCoalescedRefresh(async () => {
  calls += 1
  if (calls === 1) await first.promise
})

const initial = coordinator.request()
coordinator.request()
coordinator.request()
assert.equal(calls, 1, 'simultaneous change notifications must not start overlapping reads')
first.resolve()
await initial
assert.equal(calls, 2, 'notifications during a read must coalesce into exactly one follow-up read')

coordinator.request()
await Promise.resolve()
assert.equal(calls, 3, 'a later canonical change starts a fresh read')
coordinator.dispose()
await coordinator.request()
assert.equal(calls, 3, 'disposed views must not start more reads')

let rejectRead
const failing = createCoalescedRefresh(() => new Promise((_, reject) => { rejectRead = reject }))
const failed = failing.request()
rejectRead(new Error('expected test failure'))
await assert.rejects(failed, /expected test failure/)
failing.dispose()

console.log('Performance refresh concurrency contract: PASS')
