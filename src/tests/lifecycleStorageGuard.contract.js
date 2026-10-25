import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertLifecycleStorageAvailable } from '../application/work/lifecycleStorageGuard.js'

assert.equal(assertLifecycleStorageAvailable({ platform: 'android', nativeAvailable: true }), true,
  'Android lifecycle operations may proceed when canonical SQLite is available')
assert.throws(
  () => assertLifecycleStorageAvailable({ platform: 'android', nativeAvailable: false }),
  /Android canonical SQLite storage is unavailable/,
  'Android must fail closed when native canonical storage is unavailable',
)
assert.equal(assertLifecycleStorageAvailable({ platform: 'web', nativeAvailable: false }), false,
  'browser-only PWA operation must remain supported')
assert.equal(assertLifecycleStorageAvailable({ platform: 'web', nativeAvailable: true }), true,
  'a browser runtime with an available canonical adapter may use it')
assert.throws(
  () => assertLifecycleStorageAvailable({ platform: null, nativeAvailable: false }),
  /Cannot verify canonical lifecycle storage/,
  'unknown runtime must not silently fall back to browser-only business records',
)

const service = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
for (const [method, nextMethod] of [
  ['async startShift(data)', 'async startTrip(data)'],
  ['async startTrip(data)', 'async startRide(data)'],
  ['async startRide(data)', 'async completeTrip(data)'],
  ['async completeTrip(data)', 'async cancelTrip(data)'],
  ['async cancelTrip(data)', 'async updateTrip(data)'],
  ['async updateTrip(data)', 'async updateFuel(data)'],
  ['async endShift(data)', 'async recordFuel(data)'],
]) {
  const start = service.indexOf(method)
  assert.ok(start >= 0, `missing lifecycle method ${method}`)
  const end = service.indexOf(nextMethod, start + method.length)
  assert.ok(end > start, `missing lifecycle method boundary ${nextMethod}`)
  const body = service.slice(start, end)
  assert.match(body, /requireLifecycleStorage\(\)/, `${method} must check storage availability before choosing a write path`)
  assert.doesNotMatch(body, /nativeCanonicalAvailable\(\)/, `${method} must use one captured availability result and avoid a fallback race`)
}

console.log('Lifecycle storage guard contract: Android fails closed when canonical SQLite is unavailable; web PWA remains supported.')
