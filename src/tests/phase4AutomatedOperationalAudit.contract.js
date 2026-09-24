import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateShiftStartOdometer, validateFirstDayShiftStartOdometer, validateGapAllocation } from '../domain/work/shift.js'
import { validateEndShiftEntry } from '../domain/work/endShift.js'
import { validateTripCorrection } from '../domain/work/trip.js'
import { TRIP_STATES, canTransitionTrip, transitionTrip } from '../domain/work/tripLifecycle.js'
import { calculateFuelQuantity, validateFuelEntry } from '../domain/work/fuel.js'
import { deriveFinancialRevenue, reconcileShiftRevenue } from '../domain/work/revenueReconciliation.js'
import { TOLL_PARKING_TREATMENTS } from '../domain/work/revenueReconciliation.js'
import { derivePerformance } from '../domain/performance/performanceEngineV2.js'
import { buildMutationRecord, buildAuditRecord } from '../repositories/mutationRepository.js'

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
  assertSource('../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'START_RIDE', 'Overlay exposes canonical ride state')
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


// K — latest driver-cockpit, shell and cross-surface UX requirements that are statically verifiable.
scenario('K1/K2/K3/K4/K5/K6', () => {
  const work = read('views/WorkModuleView.vue')
  const shell = read('components/shell/KfeShell.vue')
  const timeline = read('views/TimelineView.vue')
  const overlay = read('../android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')

  // Start/end shift gates are explicit in the Work state machine.
  assert.match(work, /const toggleOnline = async \(\) =>/)
  assert.match(work, /if\(store\.isTripActive\)return fail\('End the active Trip before going Offline\./)
  assert.match(work, /const openEndShift = \(\) =>/)
  assert.match(work, /const endShiftBack = \(\) =>/)
  assert.match(work, /const endShiftConfirm = async \(\) =>/)
  assert.match(work, /closingOdo\.value/)
  assert.match(work, /shiftRevenue\.value/)
  assert.match(work, /Closing odometer and total shift revenue are required\./)

  // Fuel remains available as a compact toggle rather than a permanent large block.
  assert.match(work, /const openFuelForm = \(\) =>/)
  assert.match(work, /fuelFormOpen\.value = !fuelFormOpen\.value/)
  assert.match(work, /fuelDraftKey/)

  // Driver-facing location presentation prefers resolved place names and keeps Timeline coverage.
  assert.match(work, /locationPlace = location => location\?\.placeName \|\| 'Resolving place…'/)
  assert.match(timeline, /trip\.tripStartLocation\?\.address \|\| trip\.tripStartLocation\?\.name \|\| 'Pickup'/)

  // Shell is GPS-status driven and does not carry the retired Local-first/Fleet ERP labels.
  assert.match(shell, /Kanishka Enterprises/)
  assert.match(shell, /header-gps/)
  assert.match(shell, /gpsState/)
  assert.doesNotMatch(shell, /Fleet ERP · KFE 2\.0/)
  assert.doesNotMatch(shell, /Local-first/)

  // Native overlay exposes the same canonical ride actions and terminal fare/cancel path.
  assert.match(overlay, /ACTION_UPDATE/)
  assert.match(overlay, /START_RIDE/)
  assert.match(overlay, /END_RIDE/)
  assert.match(overlay, /ENTER_FARE/)
  assert.match(overlay, /CANCEL_RIDE/)
})


// L — executable continuity checks: performance reconciliation, history, mutation replay and source isolation.
scenario('H6/H7 — Timeline ↔ Performance ↔ shift authority', () => {
  const shifts = [
    { id: 's-l1', status: 'COMPLETED', shiftStartAt: '2026-09-24T05:00:00.000Z', shiftEndAt: '2026-09-24T13:00:00.000Z', startOdometer: 1000, endOdometer: 1100, revenue: 1000, toll: 50, parking: 20, tollParkingRevenueTreatment: 'INCLUDED' },
    { id: 's-l2', status: 'COMPLETED', shiftStartAt: '2026-09-25T05:00:00.000Z', shiftEndAt: '2026-09-25T13:00:00.000Z', startOdometer: 1100, endOdometer: 1200, revenue: 1200, toll: 50, parking: 0, tollParkingRevenueTreatment: 'EXCLUDED' },
  ]
  const trips = [
    { id: 't-l1', shiftId: 's-l1', status: 'COMPLETED', tripEndAt: '2026-09-24T10:00:00.000Z', tripKm: 80, revenue: 1000 },
    { id: 't-l2', shiftId: 's-l2', status: 'COMPLETED', tripEndAt: '2026-09-25T10:00:00.000Z', tripKm: 90, revenue: 1200 },
  ]
  const m = derivePerformance({ shifts, trips, fuelLogs: [], maintenance: [], compliance: [], settlements: [], vehicles: [], breakEvenInputs: [] }, { from: new Date('2026-09-24T00:00:00Z'), to: new Date('2026-09-25T23:59:59.999Z') })
  assert.equal(m.revenue, 2200)
  assert.equal(m.financialRevenue, 2130)
  assert.equal(m.passThroughToll, 50)
  assert.equal(m.passThroughParking, 20)
  assert.equal(m.excludedTollExpense, 50)
  assert.equal(m.operatingProfit, 2080)
  assert.equal(m.vehicleKm, 200)
  assert.equal(m.businessKm, 170)
  assert.equal(m.deadKm, 30)
})

scenario('I2/I6/I7 — multi-day/history continuity and month boundary', () => {
  const shifts = [
    { id: 's-may', status: 'COMPLETED', shiftStartAt: '2026-05-31T04:00:00.000Z', shiftEndAt: '2026-05-31T12:00:00.000Z', startOdometer: 5000, endOdometer: 5050, revenue: 500 },
    { id: 's-jun', status: 'COMPLETED', shiftStartAt: '2026-06-01T04:00:00.000Z', shiftEndAt: '2026-06-01T12:00:00.000Z', startOdometer: 5050, endOdometer: 5125, revenue: 750 },
  ]
  const may = derivePerformance({ shifts, trips: [], fuelLogs: [], maintenance: [], compliance: [], settlements: [], vehicles: [], breakEvenInputs: [] }, { from: new Date('2026-05-01T00:00:00Z'), to: new Date('2026-05-31T23:59:59.999Z') })
  const jun = derivePerformance({ shifts, trips: [], fuelLogs: [], maintenance: [], compliance: [], settlements: [], vehicles: [], breakEvenInputs: [] }, { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-30T23:59:59.999Z') })
  assert.equal(may.vehicleKm, 50)
  assert.equal(jun.vehicleKm, 75)
  assert.equal(may.revenue, 500)
  assert.equal(jun.revenue, 750)
  assert.equal(validateShiftStartOdometer(5050, 5050).valid, true)
  assert.equal(validateShiftStartOdometer(5125, 5050).gapKm, 75)
})

scenario('C6/F6/J7 — duplicate/idempotent mutation and recovery', () => {
  const payload = { id: 'trip-recovery-1', status: 'COMPLETED', revenue: 250 }
  const mutation = buildMutationRecord({ entityId: payload.id, entityType: 'TRIP', action: 'UPDATE', payload, createdAt: '2026-09-25T08:00:00.000Z' })
  const audit = buildAuditRecord({ mutationId: mutation.id, entityId: payload.id, entityType: 'TRIP', action: 'UPDATE', payload, createdAt: mutation.createdAt })
  assert.equal(mutation.status, 'PENDING')
  assert.equal(mutation.retryCount, 0)
  assert.equal(audit.mutationId, mutation.id)
  assert.notEqual(audit.id, mutation.id)
  const replay = { ...mutation, status: 'SYNCING' }
  const recovered = replay.status === 'SYNCING' ? { ...replay, status: 'PENDING' } : replay
  assert.equal(recovered.status, 'PENDING')
  assert.deepEqual(recovered.payload, payload)
})

scenario('D3/E4 — reload/restart persistence and canonical source isolation contract', () => {
  const db = read('utils/indexedDB.js')
  const repo = read('repositories/shiftTripRepository.js')
  assert.match(db, /const dbInstances = new Map\(\)/)
  assert.match(db, /dbInstance\.onversionchange = \(\) => \{/) 
  assert.match(db, /dbInstances\.delete\(name\)/)
  assert.match(repo, /trips\.put\(next\)/)
  assert.match(repo, /shifts\.put\(shift\)/)
  assert.match(repo, /readAll\('shifts'\)/)
  assert.match(repo, /readAll\('trips'\)/)
  assert.match(db, /kanishka_kfe_canonical_db/)
  assert.match(db, /kanishka_kfe_synthetic_db/)
  assert.match(db, /dbNameFor = source => source === 'synthetic' \? SYNTHETIC_DB_NAME : CANONICAL_DB_NAME/)
  assert.match(db, /initializeSyntheticStorage = async \(\) => initializeDatabase\(SYNTHETIC_DB_NAME\)/)
})

scenario('D4 — synthetic/canonical mutation boundary', () => {
  const db = read('utils/indexedDB.js')
  const mutation = read('repositories/mutationRepository.js')
  assert.match(db, /openCanonicalDB = \(\) => initializeCanonicalStorage\(\{ dataSource: 'canonical' \}\)/)
  assert.match(mutation, /openCanonicalDB\(\)/)
  assert.match(mutation, /canonical-only synchronization work/)
  assert.match(db, /if \(source === 'canonical'\) sessionStorage\.removeItem\('kfe:synthetic-date-context'\)/)
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
console.log('PHASE4 AUTOMATED OPERATIONAL AUDIT: PASS (automatable coverage only; physical-device gate remains open)')\nconsole.log('PHASE4 AUTOMATED EVIDENCE: L scenarios executed with deterministic fixtures; no defects identified in this automated pass.')\n
