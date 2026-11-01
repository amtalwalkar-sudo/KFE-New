import assert from 'node:assert/strict'
import { createNativeWorkActionController } from '../application/work/nativeWorkActionController.js'
import fs from 'node:fs'

const calls = []
const pending = [
  { eventId: 'evt-1', stage: 'GO_TO_PICKUP', tripId: 'trip-1' },
  { eventId: 'evt-2', stage: 'START_RIDE', tripId: 'trip-1' },
]
let visible = true
let handleGate
const actions = {
  async consumePendingActions() { calls.push('consume'); return pending },
  async acknowledgeAction(id) { calls.push('ack:' + id); return id !== 'evt-3' },
  async recordActionFailure(id, reason) { calls.push('failure:' + id + ':' + reason) },
}
const controller = createNativeWorkActionController({
  actions,
  isVisible: () => visible,
  async handleAction(event) {
    calls.push('handle:' + event.eventId)
    if (event.eventId === 'evt-1' && handleGate) await handleGate
    return event.eventId !== 'evt-4'
  },
})

let release
handleGate = new Promise(resolve => { release = resolve })
const first = controller.enqueue(pending[0])
const second = controller.enqueue(pending[1])
release()
assert.equal(await first, true)
assert.equal(await second, true)
assert.deepEqual(calls.slice(0, 4), ['handle:evt-1', 'ack:evt-1', 'handle:evt-2', 'ack:evt-2'])

calls.length = 0
await controller.process({ eventId: 'evt-3', stage: 'END_RIDE', tripId: 'trip-1' })
assert.ok(calls.some(call => call.startsWith('failure:evt-3:Work saved the action but native acknowledgement failed')))

calls.length = 0
await controller.process({ eventId: 'evt-4', stage: 'CANCEL', tripId: 'trip-2' })
assert.ok(calls.some(call => call.startsWith('failure:evt-4:Work did not confirm')))

calls.length = 0
visible = false
await controller.replay()
assert.deepEqual(calls, [], 'hidden Work view must not replay')
visible = true
await controller.replay()
assert.deepEqual(calls.filter(call => call.startsWith('handle:')), ['handle:evt-1', 'handle:evt-2'])
assert.ok(calls.indexOf('handle:evt-1') < calls.indexOf('handle:evt-2'), 'replay must preserve durable event order')

const unavailable = createNativeWorkActionController({
  actions: {
    async consumePendingActions() { throw new Error('Injected SQLite queue read failure.') },
    async acknowledgeAction() { throw new Error('Must not acknowledge when queue read fails.') },
    async recordActionFailure() {},
  },
  async handleAction() { throw new Error('No event should be handled when the queue read fails.') },
})
await assert.rejects(unavailable.replay(), /Injected SQLite queue read failure/, 'A failed native event read must propagate rather than become an empty queue.')

const workView = fs.readFileSync(new URL('../views/WorkModuleView.vue', import.meta.url), 'utf8')
assert.match(workView, /const nativeRecoveryReady = ref\(!nativeAndroid\)/, 'Android Work actions must start blocked until native event recovery is confirmed.')
assert.match(workView, /Native ride recovery is incomplete/, 'Work must surface an explicit recovery-blocked state.')
assert.match(workView, /if \(!nativeWritesAllowed\(\)\) return/, 'Overlay synchronization must not overwrite native workflow state before recovery completes.')
assert.match(workView, /:disabled="!nativeRecoveryReady"/, 'Primary Work controls must remain disabled while native recovery is incomplete.')

console.log('PASS: native Work events replay FIFO and acknowledge only confirmed commits')
