import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessGpsTraceCompleteness, filterGpsTrace, splitGpsTraceAtGaps } from '../domain/movement/movementAccounting.js'
import { calculateTraceDistanceKm } from '../domain/movement/traceDistance.js'
const t0=Date.parse('2026-10-16T10:00:00.000Z')
const point=(minutes,longitude)=>({latitude:19.01,longitude,accuracy:8,speed:8,capturedAt:new Date(t0+minutes*60000).toISOString()})
const trace=[point(0,72.8500),point(1,72.8600),point(11,72.9500),point(12,72.9600)]
const split=splitGpsTraceAtGaps(trace)
assert.equal(split.segments.length,2)
assert.equal(split.gaps.length,1)
assert.equal(split.gaps[0].status,'UNRESOLVED')
assert.ok(Math.abs(calculateTraceDistanceKm(filterGpsTrace(trace))-(calculateTraceDistanceKm(split.segments[0])+calculateTraceDistanceKm(split.segments[1])))<1e-9)
assert.equal(assessGpsTraceCompleteness(trace,{startAt:trace[0].capturedAt,endAt:trace[3].capturedAt}).complete,false)
const work=fs.readFileSync('src/application/work/workService.js','utf8')
const workView=fs.readFileSync('src/views/WorkModuleView.vue','utf8')
assert.match(work,/eventType: 'RIDE_START'/)
assert.match(work,/eventType: 'END'/)
assert.doesNotMatch(work,/tripKmAuthority: 'GPS_TRACE_INCOMPLETE'|estimatedGapDistanceKm/)
assert.doesNotMatch(workView,/INCOMPLETE GPS KM|pendingFareGpsGap|Valhalla gap estimate/)
console.log('GPS trace-gap math remains dormant; active trip workflow records boundary snapshots only.')
