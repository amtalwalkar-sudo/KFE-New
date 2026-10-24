import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync(new URL('../application/work/workService.js', import.meta.url), 'utf8')
const commit = service.slice(service.indexOf('const commitNativeFirst'), service.indexOf('const findNativeRecord'))
assert.ok(commit.indexOf('await CanonicalWorkBoundary.putRecord') < commit.indexOf('await ShiftTripRepository.syncCanonicalRecords'), 'native acknowledgement must precede IndexedDB refresh')
assert.ok(commit.includes('result?.accepted !== true || !result?.outcome?.record'), 'unacknowledged native commits must fail closed')
assert.ok(commit.includes('const operationId ='), 'native operation identity must be stable for the record version')
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
  const body = service.slice(start, service.indexOf(nextMethod, start + method.length))
  assert.ok(start >= 0 && body.length > 0, `missing lifecycle method ${method}`)
  assert.ok(body.includes('nativeCanonicalAvailable()'), `${method} must use native-first behavior on Android`)
}
const endShift = service.slice(service.indexOf('async endShift(data)'), service.indexOf('async recordFuel(data)'))
assert.ok(endShift.includes('const activeTrip = snapshot.trips.find'), 'shift close must check native active-trip state')
assert.ok(endShift.indexOf("await commitNativeFirst('SHIFT', completedShift)") < endShift.indexOf('checkpoint()'), 'shift close must commit before post-commit work')
console.log('PASS: native-first PWA lifecycle commit ordering')
