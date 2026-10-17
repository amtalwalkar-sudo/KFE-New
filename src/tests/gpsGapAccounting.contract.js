import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessGpsTraceCompleteness, filterGpsTrace, splitGpsTraceAtGaps } from '../domain/movement/movementAccounting.js'
import { calculateTraceDistanceKm } from '../domain/movement/traceDistance.js'

const t0 = Date.parse('2026-10-16T10:00:00.000Z')
const point = (minutes, longitude) => ({
  latitude: 19.01,
  longitude,
  accuracy: 8,
  speed: 8,
  capturedAt: new Date(t0 + minutes * 60000).toISOString()
})
const trace = [
  point(0, 72.8500),
  point(1, 72.8600),
  // A ten-minute hole represents the phone/service being unavailable.
  point(11, 72.9500),
  point(12, 72.9600)
]
const split = splitGpsTraceAtGaps(trace)
assert.equal(split.segments.length, 2)
assert.equal(split.gaps.length, 1)
assert.equal(split.gaps[0].durationMs, 10 * 60000)
assert.equal(split.gaps[0].status, 'UNRESOLVED')
assert.equal(split.segments.every(segment => segment.length === 2), true)

const fullDistance = calculateTraceDistanceKm(filterGpsTrace(trace))
const beforeDistance = calculateTraceDistanceKm(split.segments[0])
const afterDistance = calculateTraceDistanceKm(split.segments[1])
assert.ok(Math.abs(fullDistance - (beforeDistance + afterDistance)) < 1e-9,
  'measured KM must exclude the straight-line chord across the outage')
assert.ok(fullDistance > 1.5 && fullDistance < 3,
  'distance before and after the outage must remain measurable')

const quality = assessGpsTraceCompleteness(trace, {
  startAt: trace[0].capturedAt,
  endAt: trace[3].capturedAt
})
assert.equal(quality.complete, false)
assert.equal(quality.reason, 'GPS_TRACE_INTERNAL_GAP')

const service = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java', 'utf8')
const work = fs.readFileSync('src/application/work/workService.js', 'utf8')
const workView = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
assert.match(service, /MAX_ACCURACY_FOR_DISTANCE_METERS = 80f/)
assert.match(service, /MAX_CONTIGUOUS_GAP_MS = 120000L/)
assert.match(service, /appendFilteredDistanceLocation\(location\)/)
assert.match(service, /elapsedMs <= MAX_CONTIGUOUS_GAP_MS/)
assert.match(service, /displacementMeters \/ 1000f/, 'Android speed filter must convert metres to kilometres before applying km/h thresholds')
assert.match(work, /tripKmAuthority: 'GPS_TRACE_INCOMPLETE'/)
assert.match(work, /knownDistanceKm/)
assert.match(work, /estimatedGapDistanceKm/)
assert.match(work, /unresolvedGapCount/)
assert.match(work, /incompleteKmSegments/)
assert.match(work, /\/VALHALLA\/i\.test\(method\)/)
assert.match(workView, /INCOMPLETE GPS KM — THIS RIDE/)
assert.match(workView, /pendingFareGpsGap/)
assert.match(workView, /Unresolved kilometres remain flagged for later review/)

console.log('GPS outage contract passed: distance is retained on both sides, outage chord is excluded, and the ride carries explicit incomplete-kilometre metadata.')
