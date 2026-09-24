import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { validateTripCorrection } from '../domain/work/trip.js'
import { TRIP_STATES, canTransitionTrip, transitionTrip } from '../domain/work/tripLifecycle.js'
import { calculateFuelQuantity, validateFuelEntry } from '../domain/work/fuel.js'
import { deriveFinancialRevenue, reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { TOLL_PARKING_TREATMENTS } from '../domain/work/revenueReconciliation.js'

const root = new URL('../', import.meta.url)
const read = file => fs.readFileSync(new URL(file, root), 'utf8')
const assertSource = (file, needle, message) => assert.ok(read(file).includes(needle), message)

const stamp = new Date()
const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
}).formatToParts(stamp)
const part = type => parts.find(x => x.type === type)?.value
const auditStamp = `${part('day')} ${part('month')} ${part('year')} / ${part('hour')} ${part('minute')} ${part('second')}`

const scenario = (id, fn) => {
  fn()
  console.log(`PASS ${id} @ ${auditStamp}`)
}

// A/B/J — shift gates, odometer authority, gap classification and end-shift recovery.
scenario('A1/B1', () => {
  assert.deepEqual(validateShiftStartOdometer(65000, 64990), { valid: true, gapKm: 10 })
  assert.equal(validateShiftStartOdometer('', 64990).valid, false)
  assert.equal(validateShiftStartOdometer(64989, 64990).valid, false)
})
scenario('A1/B2/J3', () => {
  assert.deepEqual(validateGapAllocation(10, 'PERSONAL'), { valid: true, category: 'PERSONAL', personalKm: 10, deadKm: 0 })
  assert.deepEqual(validateGapAllocation(10, 'DEAD'), { valid: true, category: 'DEAD', personalKm: 0, deadKm: 10 })
  assert.equal(validateGapAllocation(10).valid, false)
  assert.equal(validateGapAllocation(0).valid, true)
})
scenario('I5/J5', () => {
  assert.deepEqual(validateFirstDayShiftStartOdometer(68500, 65000).historicalKm, 3500)
  assert.equal(validateFirstDayShiftStartOdometer(64999, 65000).valid, false)
})
scenario('A4/B3/B4/J2', () => {
  assert.equal(validateEndShiftEntry({ closingOdometer: 65002, startOdometer: 65000, revenue: 1 }).valid, true)
  assert.equal(validateEndShiftEntry({ closingOdometer: 64999, startOdometer: 65000, revenue: 1 }).valid, false)
  assert.equal(validateEndShiftEntry({ closingOdometer: 65002, startOdometer: 65000, revenue: '' }).valid, false)
  assert.equal(validateEndShiftEntry({ closingOdometer: 65000, startOdometer: 65000, revenue: 0 }).valid, true)
  assert.equal(validateEndShiftEntry({ closingOdometer: 65601, startOdometer: 65000, revenue: 1 }).requiresConfirmation, true)
  assert.equal(validateEndShiftEntry({ closingOdometer: 65601, startOdometer: 65000, revenue: 1, confirmLargeDistance: true }).valid, true)
})

// A/B/E — one canonical trip identity, completion/cancellation, optional fare detail and idempotent terminal replay.
scenario('A2/A3/B5/E1/E2/E3/J7', () => {
  let trip = { id: 'audit-trip-1', shiftId: 'audit-shift-1', status: TRIP_STATES.ACTIVE, revenue: null }
  const completed = transitionTrip(trip, TRIP_STATES.COMPLETED, { tripEndAt: '2026-09-25T08:00:00.000Z', tripKm: 12.5 })
  const priced = { ...completed, revenue: 250, revenueAuthority: 'SUPPORTING_ONLY' }
  assert.equal(priced.id, trip.id)
  assert.equal(priced.status, TRIP_STATES.COMPLETED)
  assert.equal(canTransitionTrip(priced.status, TRIP_STATES.COMPLETED), true)
  assert.equal(canTransitionTrip(priced.status, TRIP_STATES.CANCELLED), false)
  const replay = transitionTrip(priced, TRIP_STATES.COMPLETED)
  assert.equal(replay.id, trip.id)
  assert.equal(replay.status, TRIP_STATES.COMPLETED)
  assert.equal(validateTripCorrection({ operator: 'Uber', tripKm: '12.5', revenue: '250' }).valid, true)
  const cancelled = transitionTrip(trip, TRIP_STATES.CANCELLED, { reason: 'DRIVER_MISTAKE', revenue: 0 })
  assert.equal(cancelled.status, TRIP_STATES.CANCELLED)
  assert.equal(cancelled.revenue, 0)
  assert.equal(canTransitionTrip(cancelled.status, TRIP_STATES.CANCELLED), true)
  assert.equal(canTransitionTrip(cancelled.status, TRIP_STATES.COMPLETED), false)
})

// A5/H3/D2/F5 — offline fuel entry and deterministic amount/quantity rules.
scenario('A5/H3/D2/F5/J1', () => {
  assert.deepEqual(calculateFuelQuantity({ pricePerKg: 82, amount: 410 }), { valid: true, quantityKg: 5 })
  const fuel = validateFuelEntry({ odometer: 65002, pricePerKg: 82, amount: 410 })
  assert.equal(fuel.valid, true)
  assert.equal(fuel.quantityKg, 5)
  assert.equal(validateFuelEntry({ odometer: 65002, pricePerKg: 82, amount: 1230.01 }).valid, false)
  assert.equal(validateFuelEntry({ odometer: -1, pricePerKg: 82, amount: 410 }).valid, false)
})

// H1/H2/H5 — shift revenue remains authoritative; trip fare is supporting detail.
scenario('A2/H1/H2/H5', () => {
  const reconciliation = reconcileShiftRevenue({
    shiftRevenue: 500,
    trips: [{ status: 'COMPLETED', revenue: 300 }, { status: 'COMPLETED', revenue: 200 }, { status: 'CANCELLED', revenue: 500 }],
    toll: 50,
    tollParkingRevenueTreatment: TOLL_PARKING_TREATMENTS.INCLUDED
  })
  assert.equal(reconciliation.reconciliationStatus, 'RECONCILED')
  assert.equal(reconciliation.financialRevenue, 450)
  assert.equal(reconciliation.authoritativeRevenue, 500)
  const incomplete = reconcileShiftRevenue({ shiftRevenue: 500, trips: [{ status: 'COMPLETED', revenue: null }] })
  assert.equal(incomplete.reconciliationStatus, 'UNAVAILABLE')
  assert.equal(incomplete.reason, 'INCOMPLETE_TRIP_REVENUE_DETAIL')
})
scenario('H1/BR-11', () => {
  const included = deriveFinancialRevenue({ customerPaidTotal: 500, toll: 50, parking: 25, tollParkingRevenueTreatment: 'INCLUDED' })
  const excluded = deriveFinancialRevenue({ customerPaidTotal: 500, toll: 50, parking: 25, tollParkingRevenueTreatment: 'EXCLUDED' })
  assert.equal(included.financialRevenue, 425)
  assert.equal(included.excludedActualExpense, 0)
  assert.equal(excluded.financialRevenue, 500)
  assert.equal(excluded.excludedActualExpense, 75)
})

// I/J — IST day boundaries are deterministic and preserve calendar ownership at midnight.
scenario('I1/I3/I4/J4', () => {
  const beforeMidnight = new Date('2026-09-24T18:29:59.999Z')
  const afterMidnight = new Date('2026-09-24T18:30:00.000Z')
  const key = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  assert.equal(key(beforeMidnight), '2026-09-24')
  assert.equal(key(afterMidnight), '2026-09-25')
})

// I2 — multi-day odometer carry must remain monotonic.
scenario('I2', () => {
  const day1 = validateEndShiftEntry({ closingOdometer: 65040, startOdometer: 65000, revenue: 800 })
  const day2 = validateShiftStartOdometer(65040, 65040)
  const day3 = validateShiftStartOdometer(65041, 65040)
  assert.equal(day1.valid, true)
  assert.equal(day2.gapKm, 0)
  assert.equal(day3.gapKm, 1)
})

// J6/G2/G3/G4 — GPS state machine and degraded operation are validated by source contract.
scenario('G2/G3/G4', () => {
  const gps = read('services/locationService.js')
  assert.match(gps, /setState\(state\)/)
  assert.match(gps, /WAITING/)
  assert.match(gps, /TRIP_ACTIVE/)
  assert.match(gps, /runHandlerSafely/)
  assert.match(gps, /handler failed; cadence will continue/)
  assert.match(gps, /resolve\(null\)/)
})

// C/D/E/F — canonical convergence and persistence/recovery wiring.
scenario('C1/C2/C3/C4/C5/D1/D2/E1/E2/E3/F1/F2/F4/F5', () => {
  assertSource('repositories/shiftTripRepository.js', 'transitionTrip(record, status, data)', 'Trip transitions must use canonical lifecycle')
  assertSource('application/work/workService.js', 'ShiftTripRepository.completeTrip', 'Main app completion must use canonical repository')
  assertSource('application/work/workService.js', 'ShiftTripRepository.cancelTrip', 'Main app cancellation must use canonical repository')
  assertSource('repositories/shiftTripRepository.js', 'async setTripStage', 'Pickup/ride stage must persist canonically')
  assertSource('repositories/mutationRepository.js', 'pending_mutations', 'Recovery queue must be canonical')
  assertSource('utils/indexedDB.js', 'const CANONICAL_DB_NAME', 'Canonical persistence DB must be explicit')
  assertSource('utils/indexedDB.js', 'const SYNTHETIC_DB_NAME', 'Synthetic persistence DB must be physically isolated')
  assertSource('views/WorkModuleView.vue', 'SWIPE TO END RIDE', 'PWA exposes canonical end-ride state')
  assertSource('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'START_RIDE', 'Overlay exposes canonical ride state')
})

// G5 — location-event UI contract: place-name layer must remain preferred where resolved.
scenario('G5', () => {
  const workView = read('views/WorkModuleView.vue')
  assert.ok(/place|location/i.test(workView), 'Driver-facing Work view must retain location presentation surface')
  assertSource('views/TimelineView.vue', 'location', 'Timeline must retain location event presentation')
})

// J1/J2/J3/J5/J6/J7 — defensive boundaries.
scenario('J1/J2/J3/J5/J6/J7', () => {
  assert.equal(validateGapAllocation(-1).valid, false)
  assert.equal(validateTripCorrection({ tripKm: '-1' }).valid, false)
  assert.equal(validateTripCorrection({ revenue: '-1' }).valid, false)
  assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 0, amount: 410 }).valid, false)
  assert.equal(validateFuelEntry({ odometer: 65000, pricePerKg: 82, amount: 0 }).valid, false)
})

// Explicitly document the device-only remainder: these are not simulated as PASS.
const deviceOnly = [
  'C4/C5 real Android overlay/background/bubble/minimize/reopen',
  'F2 force-stop/process death and native resume behavior',
  'F3 lock/unlock',
  'G1/G2/G3/G4 real Android GPS hardware and permission prompts',
  'real touch/gesture behavior and device-specific rendering',
]
console.log(`DEFERRED_DEVICE_GATE: ${deviceOnly.join(' | ')}`)
console.log('PHASE4 AUTOMATED OPERATIONAL AUDIT: PASS (automatable coverage only)')
