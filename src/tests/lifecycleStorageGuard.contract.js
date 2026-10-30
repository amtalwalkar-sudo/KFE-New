import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertLifecycleStorageAvailable } from '../application/work/lifecycleStorageGuard.js'
import { configureWorkRuntimePorts } from '../application/work/workRuntimePorts.js'
import { CanonicalWorkBoundary } from '../application/work/canonicalWorkBoundary.js'

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
  /Cannot verify canonical write storage/,
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

const boundary = fs.readFileSync(new URL('../application/work/canonicalWorkBoundary.js', import.meta.url), 'utf8')
assert.match(boundary, /const requireCanonicalWriteRoute = \(\) => \{[\s\S]*?return assertLifecycleStorageAvailable\(\{ platform, nativeAvailable: nativeCanonicalAvailable\(\) \}\)/,
  'canonical write boundary must apply the same Android fail-closed policy')
for (const [method, nextMethod, nativeCall, browserCall] of [
  ['async putRecord(input)', 'async persistEventLocationSnapshot(snapshot)', 'WorkRuntimePorts\\.canonicalWork\\.putRecord\\(normalized\\)', 'WorkRuntimePorts\\.browserCanonicalWork\\.putRecord\\(normalized\\)'],
]) {
  const start = boundary.indexOf(method)
  const end = boundary.indexOf(nextMethod, start + method.length)
  assert.ok(start >= 0 && end > start, `missing canonical write boundary method ${method}`)
  const body = boundary.slice(start, end)
  assert.match(body, /const nativeAvailable = requireCanonicalWriteRoute\(\)/, `${method} must select a safe route before writing`)
  assert.match(body, new RegExp(`if \\(nativeAvailable\\) return ${nativeCall}`), `${method} must use native canonical storage when available`)
  assert.match(body, new RegExp(`return ${browserCall}`), `${method} must preserve browser-only PWA writes`)
  assert.doesNotMatch(body, /WorkRuntimePorts\.canonicalWork\.isAvailable\(\)/, `${method} must not bypass the runtime guard`)
}

const noop = async () => ({})
configureWorkRuntimePorts({
  nativeWorkActions: {
    clearPendingAction: noop, addListener: noop, consumePendingActions: noop,
    consumePendingAction: noop, acknowledgeAction: noop, recordActionFailure: noop,
  },
  canonicalWork: {
    putRecord: noop, getRecord: noop, listRecords: noop, getOperation: noop, isAvailable: () => false,
    prepareCreateIntent: noop, completeCreateIntent: noop, migrateLegacySnapshot: noop, verifyLegacyMigration: noop, getMigration: noop,
    beginCanonicalReset: noop, clearCanonicalReset: noop, completeCanonicalReset: noop, releaseCanonicalReset: noop, getCanonicalResetState: noop,
  },
  browserCanonicalWork: { putRecord: noop, getRecord: noop, listRecords: noop, getOperation: noop },
  tripBoundaryLocation: { queueEventLocationCapture: noop, captureOneShotLocation: noop },
  gpsPermissions: { isNativePlatform: () => true, getLocationStatus: noop, openBackgroundLocationSettings: noop, requestLocationPermissions: noop, requestBackgroundLocationPermission: noop },
  diagnostics: { start: noop, waiting: noop, checkpoint: noop, error: noop, complete: noop, snapshot: noop, subscribe: noop, clear: noop },
  androidOverlay: { hide: noop, update: noop, prepare: noop, fareSaved: noop, cancelSaved: noop },
  platform: { getPlatform: () => 'android', getStartupPermissionStatus: noop, requestStartupPermission: noop, openStartupSetting: noop },
})
await assert.rejects(
  CanonicalWorkBoundary.putRecord({ operationId: 'op-1', entityType: 'TRIP', record: { id: 'trip-1', shiftId: 'shift-1' } }),
  /Android canonical SQLite storage is unavailable/,
  'direct canonical record writes must fail closed in Android instead of reaching IndexedDB',
)
console.log('Canonical write boundary contract: Android never falls back to browser business-record writes; web PWA remains supported.')
console.log('Lifecycle storage guard contract: Android fails closed when canonical SQLite is unavailable; web PWA remains supported.')
