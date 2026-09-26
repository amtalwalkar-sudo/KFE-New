import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4175/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4175'], {
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
  throw new Error('Cross-surface lifecycle dev server did not start.\n' + output)
}
const stop = async () => {
  if (!dev.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch (_) {}
  await new Promise(resolve => setTimeout(resolve, 400))
}
const assert = (value, message) => { if (!value) throw new Error(message) }

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

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
    const today = new Date()
    const dayRange = istDayRange(today)
    assert(dayRange, 'Unable to construct the current IST day range.')
    // Keep the fixture safely inside the requested IST day. Using "now - 6h" can
    // cross the IST day boundary on CI, causing TimelineService.getDay(today)
    // to exclude an otherwise correctly persisted completed shift.
    const start = new Date(dayRange.from.getTime() + 2 * 60 * 60 * 1000)
    const end = new Date(dayRange.from.getTime() + 6 * 60 * 60 * 1000)
    const shiftId = 'phase4-lifecycle-shift'
    const completedTripId = 'phase4-lifecycle-completed'
    const cancelledTripId = 'phase4-lifecycle-cancelled'

    await deleteDb('kanishka_kfe_canonical_db')
    setActiveDataSource('canonical')

    const shift = await WorkService.startShift({
      id: shiftId,
      startOdometer: 1000,
      openingPersonalKm: 10,
      openingDeadKm: 10,
      shiftStartAt: start.toISOString(),
    })
    assert(shift.id === shiftId && shift.status === 'ACTIVE', 'Work did not create the expected active shift.')

    const activeTrip = await ShiftTripRepository.createTrip({
      id: completedTripId,
      shiftId,
      operator: 'Uber',
      tripStartAt: new Date(start.getTime() + 30 * 60000).toISOString(),
      tripStartLocation: { latitude: 19.076, longitude: 72.8777, placeName: 'Mumbai Pickup', capturedAt: start.toISOString() },
      tripKm: 80,
      revenue: 800,
    })

    const workWhileActive = await WorkService.getActiveState()
    assert(workWhileActive.shift?.id === shiftId, 'Work lost the active shift identity.')
    assert(workWhileActive.trip?.id === completedTripId, 'Work did not expose the active trip identity.')

    const timelineWhileActive = await TimelineService.getDay(today)
    assert(!timelineWhileActive.events.some(event => event.id === completedTripId), 'Timeline exposed an ACTIVE trip as a terminal event.')

    await WorkService.completeTrip({
      id: completedTripId,
      shiftId,
      tripEndAt: new Date(start.getTime() + 90 * 60000).toISOString(),
      tripEndLocation: { latitude: 19.08, longitude: 72.88, placeName: 'Mumbai Drop', capturedAt: end.toISOString() },
      tripKm: 80,
    })

    const afterComplete = await WorkService.getActiveState()
    assert(afterComplete.shift?.id === shiftId && !afterComplete.trip, 'Work active state diverged after trip completion.')

    const cancelledTrip = await ShiftTripRepository.createTrip({
      id: cancelledTripId,
      shiftId,
      operator: 'Uber',
      tripStartAt: new Date(start.getTime() + 120 * 60000).toISOString(),
      tripStartLocation: { latitude: 19.09, longitude: 72.89, placeName: 'Cancel Pickup', capturedAt: start.toISOString() },
      tripKm: 20,
      revenue: 300,
    })
    assert(cancelledTrip.id === cancelledTripId, 'Failed to create cancellation fixture.')

    await WorkService.cancelTrip({
      id: cancelledTripId,
      tripEndAt: new Date(start.getTime() + 125 * 60000).toISOString(),
      tripEndLocation: { latitude: 19.091, longitude: 72.891, placeName: 'Cancel Point', capturedAt: end.toISOString() },
      revenue: 300,
      reason: 'DRIVER_MISTAKE',
    })

    const tripsBeforeShiftEnd = await WorkService.getTripsForShift(shiftId)
    const completed = tripsBeforeShiftEnd.find(trip => trip.id === completedTripId)
    const cancelled = tripsBeforeShiftEnd.find(trip => trip.id === cancelledTripId)
    assert(completed?.status === 'COMPLETED', 'Completed trip did not persist COMPLETED.')
    assert(cancelled?.status === 'CANCELLED', 'Cancelled trip did not persist CANCELLED.')
    assert(completed?.shiftId === shiftId && cancelled?.shiftId === shiftId, 'Trip/shift association changed across lifecycle transitions.')

    await ShiftTripRepository.completeShift({
      id: shiftId,
      endOdometer: 1100,
      revenue: 800,
      toll: 50,
      parking: 20,
      tollParkingRevenueTreatment: 'EXCLUDED',
      trips: [{ id: completedTripId, revenue: 800, tripKm: 80 }],
    })

    const workAfterShift = await WorkService.getActiveState()
    assert(!workAfterShift.shift && !workAfterShift.trip, 'Work still exposed a completed shift as active.')

    const timeline = await TimelineService.getDay(today)
    const completedEvent = timeline.events.find(event => event.id === completedTripId)
    const cancelledEvent = timeline.events.find(event => event.id === cancelledTripId)
    assert(completedEvent?.record.status === 'COMPLETED', 'Timeline status does not match completed repository state.')
    assert(cancelledEvent?.record.status === 'CANCELLED', 'Timeline status does not match cancelled repository state.')
    assert(timeline.rides === 1, 'Timeline counted a cancelled trip as a completed ride.')
    assert(Number(timeline.authoritativeRevenue) === 800, 'Timeline authoritative revenue diverged from shift-end revenue.')
    assert(Number(timeline.businessKm) === 80, 'Timeline business KM counted cancelled-trip KM.')

    const snapshot = await PerformanceService.getSnapshot()
    const range = istDayRange(today)
    const metrics = PerformanceService.getMetrics(snapshot, range)
    assert(Number(metrics.revenue) === 800, 'Performance revenue diverged from shift authority.')
    assert(Number(metrics.vehicleKm) === 100, 'Performance vehicle KM diverged from opening/closing odometer.')
    assert(Number(metrics.businessKm) === 80, 'Performance business KM counted cancelled-trip KM.')
    assert(Number(metrics.counts?.trips) === 1, 'Performance trip count included a cancelled trip.')

    const db = await openCanonicalDB()
    const persisted = await new Promise((resolve, reject) => {
      const tx = db.transaction(['shifts', 'trips'], 'readonly')
      const shifts = tx.objectStore('shifts').get(shiftId)
      const trips = tx.objectStore('trips').getAll()
      tx.oncomplete = () => resolve({ shift: shifts.result, trips: trips.result || [] })
      tx.onerror = () => reject(tx.error)
    })
    const persistedCompleted = persisted.trips.find(trip => trip.id === completedTripId)
    const persistedCancelled = persisted.trips.find(trip => trip.id === cancelledTripId)
    assert(persisted.shift?.status === 'COMPLETED' && persisted.shift.endOdometer === 1100, 'Canonical shift lifecycle state is incorrect.')
    assert(persistedCompleted?.status === 'COMPLETED' && persistedCompleted.tripKm === 80 && persistedCompleted.revenue === 800, 'Canonical completed trip state is incorrect.')
    assert(persistedCancelled?.status === 'CANCELLED' && persistedCancelled.cancelledRevenue === 300, 'Canonical cancelled trip state is incorrect.')

    return {
      shift: { id: persisted.shift.id, status: persisted.shift.status, startOdometer: persisted.shift.startOdometer, endOdometer: persisted.shift.endOdometer, revenue: persisted.shift.revenue },
      completedTrip: { id: persistedCompleted.id, status: persistedCompleted.status, tripKm: persistedCompleted.tripKm, revenue: persistedCompleted.revenue },
      cancelledTrip: { id: persistedCancelled.id, status: persistedCancelled.status, cancelledRevenue: persistedCancelled.cancelledRevenue },
      timeline: { rides: timeline.rides, authoritativeRevenue: timeline.authoritativeRevenue, businessKm: timeline.businessKm },
      performance: { revenue: metrics.revenue, vehicleKm: metrics.vehicleKm, businessKm: metrics.businessKm, trips: metrics.counts?.trips },
    }
  })

  const timelineText = await (async () => {
    await page.goto(base + '#/timeline', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('.timeline').waitFor({ state: 'attached', timeout: 30000 })
    await page.getByRole('button', { name: 'Today', exact: true }).click()
    await page.getByText('Mumbai Pickup → Mumbai Drop', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    return page.locator('.timeline').innerText()
  })()
  assert(timelineText.includes('✓ Completed'), 'Timeline UI did not render the completed lifecycle state.')
  assert(timelineText.includes('Cancelled'), 'Timeline UI did not render the cancelled lifecycle state.')
  assert(timelineText.includes('Mumbai Pickup → Mumbai Drop'), 'Timeline UI lost the canonical completed trip identity.')

  await page.goto(base + '#/performance', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.performance-page').waitFor({ state: 'attached', timeout: 30000 })
  const performanceText = await page.locator('.performance-page').innerText()
  assert(performanceText.includes('₹800'), 'Performance UI did not render the authoritative shift revenue.')

  console.log('PASS Phase 4 Item 4 Cross-surface lifecycle:', JSON.stringify(evidence))
} catch (error) {
  throw new Error(error.message + '\n' + output)
} finally {
  await browser?.close()
  await stop()
}
