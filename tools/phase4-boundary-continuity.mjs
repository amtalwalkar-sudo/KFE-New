import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4176/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4176'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' }, detached: true,
})
let output = ''
dev.stdout.on('data', chunk => { output += chunk.toString() })
dev.stderr.on('data', chunk => { output += chunk.toString() })

const waitForServer = async () => {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try { if ((await fetch(base)).ok) return } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Phase 4 boundary matrix dev server did not start.\n' + output)
}
const stop = async () => {
  if (!dev.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch (_) {}
  await new Promise(resolve => setTimeout(resolve, 400))
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const evidence = await page.evaluate(async () => {
    const assert = (value, message) => { if (!value) throw new Error(message) }
    const { setActiveDataSource, openCanonicalDB } = await import('/src/utils/indexedDB.js')
    const { ShiftTripRepository } = await import('/src/repositories/shiftTripRepository.js')
    const { WorkService } = await import('/src/application/work/workService.js')
    const { TimelineService } = await import('/src/application/timeline/timelineService.js')
    const { PerformanceService } = await import('/src/application/performance/performanceService.js')
    const { istDayRange } = await import('/src/domain/time/ist.js')

    const deleteDb = name => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error || new Error('Failed to clear ' + name))
      request.onblocked = () => reject(new Error('Delete blocked for ' + name))
    })
    const readAll = async storeName => {
      const db = await openCanonicalDB()
      return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => reject(request.error || new Error('Read failed: ' + storeName))
      })
    }
    const iso = (day, hour) => new Date(day + 'T' + hour + ':00:00+05:30').toISOString()

    await deleteDb('kanishka_kfe_canonical_db')
    setActiveDataSource('canonical')

    // B2: gap allocation must fully classify the odometer gap.
    const personal = WorkService.validateGapAllocation(100, 'PERSONAL')
    const dead = WorkService.validateGapAllocation(100, 'DEAD')
    const invalidCategory = WorkService.validateGapAllocation(100, 'INVALID')
    assert(personal.valid === true && personal.personalKm === 100 && personal.deadKm === 0, 'B2 Personal KM classification was rejected or misclassified.')
    assert(dead.valid === true && dead.personalKm === 0 && dead.deadKm === 100, 'B2 Dead KM classification was rejected or misclassified.')
    assert(invalidCategory.valid === false && invalidCategory.requiresGapAllocation === true, 'B2 invalid gap category was accepted.')

    // B3: an active ride must block the Offline/end-shift transition.
    const b3Shift = await WorkService.startShift({ id: 'phase4-b3-shift', startOdometer: 1000, shiftStartAt: iso('2026-09-23', '08') })
    await ShiftTripRepository.createTrip({ id: 'phase4-b3-trip', shiftId: b3Shift.id, operator: 'Uber', tripStartAt: iso('2026-09-23', '09'), tripKm: 10, revenue: 100 })
    const blocked = await WorkService.endShift({ shiftId: b3Shift.id, closingOdometer: 1010, revenue: 0 })
    assert(blocked.ok === false && blocked.reason === 'ACTIVE_TRIP_IN_PROGRESS', 'B3 did not block Offline/end-shift while a ride was active.')
    const stillActive = await WorkService.getActiveState()
    assert(stillActive.shift?.id === b3Shift.id && stillActive.trip?.id === 'phase4-b3-trip', 'B3 blocking changed active state.')

    // B6: terminal duplicate taps must be idempotent.
    await WorkService.completeTrip({ id: 'phase4-b3-trip', shiftId: b3Shift.id, tripEndAt: iso('2026-09-23', '09:30'), tripEndLocation: { latitude: 19.07, longitude: 72.87, placeName: 'Drop', capturedAt: iso('2026-09-23', '09:30') }, tripKm: 10 })
    const mutationsAfterFirst = (await readAll('pending_mutations')).filter(row => row.entityId === 'phase4-b3-trip').length
    const duplicate = await WorkService.completeTrip({ id: 'phase4-b3-trip', shiftId: b3Shift.id, tripEndAt: iso('2026-09-23', '09:30'), tripEndLocation: { latitude: 19.07, longitude: 72.87, placeName: 'Drop', capturedAt: iso('2026-09-23', '09:30') }, tripKm: 10 })
    const mutationsAfterDuplicate = (await readAll('pending_mutations')).filter(row => row.entityId === 'phase4-b3-trip').length
    assert(duplicate?.status === 'COMPLETED', 'B6 duplicate completion did not return the terminal trip.')
    assert(mutationsAfterDuplicate === mutationsAfterFirst, 'B6 duplicate completion created another mutation.')
    await ShiftTripRepository.completeShift({ id: b3Shift.id, endOdometer: 1010, revenue: 100, trips: [{ id: 'phase4-b3-trip', revenue: 100, tripKm: 10 }] })

    // Build two consecutive days for H2 and I1-I3.
    const day1 = '2026-09-23'
    const day2 = '2026-09-24'
    const makeCompletedShift = async (id, day, startOdometer, endOdometer, revenue, tripId) => {
      const shift = await WorkService.startShift({ id, startOdometer, shiftStartAt: iso(day, '08') })
      await ShiftTripRepository.createTrip({ id: tripId, shiftId: id, operator: 'Uber', tripStartAt: iso(day, '09'), tripKm: endOdometer - startOdometer, revenue })
      await WorkService.completeTrip({ id: tripId, shiftId: id, tripEndAt: iso(day, '10'), tripEndLocation: { latitude: 19.08, longitude: 72.88, placeName: 'Drop', capturedAt: iso(day, '10') }, tripKm: endOdometer - startOdometer })
      const result = await WorkService.endShift({ shiftId: id, closingOdometer: endOdometer, revenue, toll: 0, parking: 0, tollParkingRevenueTreatment: 'INCLUDED' })
      assert(result.ok === true, id + ' did not close cleanly.')
      return shift
    }

    await makeCompletedShift('phase4-day1-shift', day1, 2000, 2050, 500, 'phase4-day1-trip')
    await makeCompletedShift('phase4-day2-shift', day2, 2050, 2125, 750, 'phase4-day2-trip')

    // H2: each daily Timeline total must equal that day's shift-authoritative revenue.
    const timeline1 = await TimelineService.getDay(new Date(day1 + 'T12:00:00+05:30'))
    const timeline2 = await TimelineService.getDay(new Date(day2 + 'T12:00:00+05:30'))
    assert(Number(timeline1.authoritativeRevenue) === 500 && timeline1.rides === 1, 'H2 day-1 total does not reconcile.')
    assert(Number(timeline2.authoritativeRevenue) === 750 && timeline2.rides === 1, 'H2 day-2 total does not reconcile.')

    // I1-I3: closing one day and opening the next preserves odometer and financial continuity.
    const lastShift = await ShiftTripRepository.getLastCompletedShift()
    assert(lastShift?.id === 'phase4-day2-shift' && lastShift.endOdometer === 2125, 'I1 latest completed shift was not preserved.')
    assert(lastShift.startOdometer === 2050, 'I2 next-day opening odometer did not carry the prior closing odometer.')
    const performance = await PerformanceService.getSnapshot()
    const range = { from: istDayRange(new Date(day1 + 'T12:00:00+05:30')).from, to: istDayRange(new Date(day2 + 'T12:00:00+05:30')).to }
    const metrics = PerformanceService.getMetrics(performance, range)
    assert(Number(metrics.revenue) === 1250, 'I3 cross-day financial total did not carry both completed shifts.')
    assert(Number(metrics.vehicleKm) === 125, 'I2 cross-day vehicle KM did not carry both days.')

    // J1: zero fare/expense is a valid completed shift/trip state.
    await makeCompletedShift('phase4-zero-shift', '2026-09-25', 3000, 3000, 0, 'phase4-zero-trip')
    const zeroTimeline = await TimelineService.getDay(new Date('2026-09-25T12:00:00+05:30'))
    assert(Number(zeroTimeline.authoritativeRevenue) === 0 && zeroTimeline.rides === 1, 'J1 zero-value fare was not preserved as a valid financial day.')

    // J2: same opening/closing odometer is valid.
    assert((await ShiftTripRepository.getLastCompletedShift()).endOdometer === 3000, 'J2 same-odometer close was not persisted.')

    // J3: large but valid gap requires explicit confirmation, then succeeds.
    const large = await WorkService.startShift({ id: 'phase4-large-shift', startOdometer: 4000, shiftStartAt: iso('2026-09-25', '14') })
    const largeBlocked = await WorkService.endShift({ shiftId: large.id, closingOdometer: 4601, revenue: 0 })
    assert(largeBlocked.ok === false && largeBlocked.requiresConfirmation === true && largeBlocked.distanceKm === 601, 'J3 large odometer gap did not require explicit confirmation.')
    const largeClosed = await WorkService.endShift({ shiftId: large.id, closingOdometer: 4601, revenue: 0, confirmLargeDistance: true })
    assert(largeClosed.ok === true, 'J3 confirmed large odometer gap did not close.')

    // J4: events exactly around IST midnight stay on their correct reporting days.
    const midnightShift = await WorkService.startShift({ id: 'phase4-midnight-shift', startOdometer: 5000, shiftStartAt: '2026-09-24T23:55:00+05:30' })
    await ShiftTripRepository.createTrip({ id: 'phase4-midnight-trip', shiftId: midnightShift.id, operator: 'Uber', tripStartAt: '2026-09-24T23:59:30+05:30', tripKm: 5, revenue: 50 })
    await WorkService.completeTrip({ id: 'phase4-midnight-trip', shiftId: midnightShift.id, tripEndAt: '2026-09-25T00:05:00+05:30', tripEndLocation: { latitude: 19.08, longitude: 72.88, placeName: 'Midnight Drop', capturedAt: '2026-09-25T00:05:00+05:30' }, tripKm: 5 })
    await WorkService.endShift({ shiftId: midnightShift.id, closingOdometer: 5005, revenue: 50 })
    const preMidnight = await TimelineService.getDay(new Date('2026-09-24T12:00:00+05:30'))
    const postMidnight = await TimelineService.getDay(new Date('2026-09-25T12:00:00+05:30'))
    assert(preMidnight.events.some(event => event.id === 'phase4-midnight-trip') === true, 'J4 midnight-start trip was not attributed to its start day.')
    assert(postMidnight.events.some(event => event.id === 'phase4-midnight-trip') === false, 'J4 midnight-start trip leaked into the next reporting day.')

    return {
      cases: ['B2','B3','B6','H2','I1','I2','I3','J1','J2','J3','J4'],
      b3: blocked.reason,
      b6: { mutationsAfterFirst, mutationsAfterDuplicate },
      daily: { day1: timeline1.authoritativeRevenue, day2: timeline2.authoritativeRevenue },
      crossDay: { revenue: metrics.revenue, vehicleKm: metrics.vehicleKm },
      zeroValue: { revenue: zeroTimeline.authoritativeRevenue, rides: zeroTimeline.rides },
      largeGap: { distanceKm: largeBlocked.distanceKm, confirmed: largeClosed.ok },
      midnight: { startDayHasTrip: true, nextDayHasTrip: false },
    }
  })

  console.log('PASS Phase 4 boundary/continuity executable coverage:', JSON.stringify(evidence))
} catch (error) {
  throw new Error(error.message + '\n' + output)
} finally {
  await browser?.close()
  await stop()
}
