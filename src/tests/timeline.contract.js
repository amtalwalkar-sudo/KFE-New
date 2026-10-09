import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/views/TimelineView.vue', 'utf8')
const service = fs.readFileSync('src/application/timeline/timelineService.js', 'utf8')
const operational = fs.readFileSync('src/application/timeline/operationalRecordService.js', 'utf8')
const endShift = fs.readFileSync('src/application/work/endShift.js', 'utf8')
const cockpit = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const performanceService = fs.readFileSync('src/application/performance/performanceService.js', 'utf8')

for (const text of ['TimelineService', 'Day', 'Personal', 'Week', 'Month', 'Authoritative Revenue', 'Target', 'Fare —', 'const timestamp = value =>', 'numeric < 1e12 ? numeric * 1000 : numeric', 'const duration = trip =>']) {
  assert.ok(timeline.includes(text), `Timeline view must contain: ${text}`)
}
assert.doesNotMatch(timeline, /Operator.*filter|showOperators|chooseOperator/)
assert.doesNotMatch(timeline, /totalRevenue\s*=|reduce\(\(n,t\).*revenue/)

assert.ok(service.includes('OperationalRecordService'))
assert.ok(service.includes('authoritativeRevenue'))
assert.ok(service.includes('record => record.toll'))
assert.ok(service.includes('record => record.parking'))
assert.ok(operational.includes("const tripToll = tripAmount(terminal, 'toll')"))
assert.ok(operational.includes("const tripParking = tripAmount(terminal, 'parking')"))
assert.ok(operational.includes("const additionalOnly = shift.tollParkingCaptureMode === 'ADDITIONAL_ONLY'"))
assert.ok(operational.includes("additionalOnly ? Number(shift.toll || 0) + tripToll : Math.max(Number(shift.toll || 0), tripToll)"))
assert.ok(operational.includes("additionalOnly ? Number(shift.parking || 0) + tripParking : Math.max(Number(shift.parking || 0), tripParking)"))
assert.ok(operational.includes("const invalidTripKm = completed.some(trip =>"))
assert.ok(operational.includes("businessKm: !Number.isFinite(businessKm)"))
assert.ok(service.includes('record.shift.openingPersonalKm'))
assert.ok(endShift.includes('revenue'))
assert.doesNotMatch(endShift, /calculateShiftRevenue/)
assert.ok(cockpit.includes('PerformanceService.getDailyTargetSnapshot()'))
assert.ok(cockpit.includes('shiftRevenue'))
assert.ok(performanceService.includes('getDailyTargetSnapshot'))

// Timeline must not fabricate mileage when a completed trip lacks authoritative trip KM.
assert.ok(operational.includes("const businessKm = invalidTripKm\n      ? NaN\n      : completed.reduce((sum, trip) => sum + Number(trip.tripKm), 0)"))
assert.ok(operational.includes("const deadKm = vehicleKm == null || invalidTripKm ? null : vehicleKm - businessKm"))

console.log('KFE Timeline contract tests: PASS')

// Timeline quick-edit must round-trip trip-level financial fields.
for (const text of [
  'toll:trip.toll??0',
  'parking:trip.parking??0',
  'toll:form.value.toll,parking:form.value.parking',
  "openTimelineKeypad('toll')",
  "openTimelineKeypad('parking')"
]) {
  assert.ok(timeline.includes(text), `Timeline quick-edit must include: ${text}`)
}
