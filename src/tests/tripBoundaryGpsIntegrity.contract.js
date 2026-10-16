import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const repository = read('../repositories/shiftTripRepository.js')
const service = read('../application/work/workService.js')
const location = read('../application/work/location.js')
const view = read('../views/WorkModuleView.vue')
const overlay = read('../../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')

assert.ok(repository.includes("async setTripRideStartLocation(id, location, lifecycleAt = null)"), 'passenger-ride start GPS must be stored separately')
assert.ok(repository.includes("record.rideStartLocationEventAt = lifecycleAt || record.tripStartAt || null"), 'ride start GPS must link to the authoritative lifecycle timestamp')
assert.ok(repository.includes("next.tripEndLocationStatus = data.tripEndLocation ? 'CAPTURED' : 'MISSING'"), 'missing endpoint GPS must be explicit at completion')
assert.ok(repository.includes("if (field === 'tripEndLocation') record.tripEndLocationStatus = 'CAPTURED'"), 'a fresh endpoint fix must clear missing status')
assert.ok(repository.includes('data.tripEndAt || record.tripEndAt || now'), 'a delayed PWA completion must preserve an existing canonical completion timestamp')
assert.ok(overlay.includes('trip.put("rideStartLocationStatus","MISSING")'), 'native overlay must explicitly expose an unavailable ride-start GPS fix')
assert.ok(overlay.includes('trip.put("tripEndLocationStatus",trip.has("tripEndLocation")&&!trip.isNull("tripEndLocation")?"CAPTURED":"MISSING")'), 'native overlay must explicitly expose an unavailable endpoint GPS fix')
assert.ok(service.includes("eventType: 'RIDE_START'"), 'ride start must capture a distinct GPS boundary')
assert.ok(service.includes('setTripRideStartLocation(data.id, location, result.tripStartAt || null)'), 'ride start fix must be associated with tripStartAt')
assert.ok(location.includes("maximumAge: eventType === 'RIDE_START' || eventType === 'END' ? 0 : 30000"), 'ride start and end require fresh GPS fixes')
assert.ok(service.includes("console.warn('Trip completed without a fresh endpoint GPS fix:', tripId)"), 'missing endpoint capture must be visible')
assert.ok(!service.includes('else if (finalTracePoint) await ShiftTripRepository.setTripEndLocation'), 'an old trace point must not masquerade as the endpoint fix')
assert.ok(view.includes('if (nativeAndroid) return false'), 'Android dead-movement capture must not fall back to browser geolocation')
assert.ok(view.includes('if (!nativeTraceStarted && !nativeAndroid && store.trip?.id)'), 'Android passenger-ride capture must not fall back to browser geolocation')

console.log('PASS: lifecycle-aligned GPS boundaries, explicit missing endpoint, and Android/PWA GPS isolation')
