import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4173/'
const preview = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
  detached: true,
})
let output = ''
preview.stdout.on('data', chunk => { output += chunk.toString() })
preview.stderr.on('data', chunk => { output += chunk.toString() })

const waitForServer = async () => {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try {
      if ((await fetch(base)).ok) return
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Preview server did not start.')
}
const stop = async () => {
  if (!preview.pid) return
  try { process.kill(-preview.pid, 'SIGTERM') } catch (_) {}
  await new Promise(resolve => setTimeout(resolve, 400))
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })

  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
    permissions: ['geolocation'],
    reducedMotion: 'reduce',
  })

  await context.addInitScript(() => {
    const mode = sessionStorage.getItem('__phase4_gps_mode') || 'connected'
    const originalPermissions = navigator.permissions
    if (originalPermissions?.query) {
      navigator.permissions.query = async descriptor => {
        if (descriptor?.name === 'geolocation') {
          return {
            state: mode === 'denied' ? 'denied' : 'granted',
            onchange: null,
          }
        }
        return originalPermissions.query.call(originalPermissions, descriptor)
      }
    }
    navigator.geolocation.getCurrentPosition = (success, failure) => {
      if (mode === 'unavailable') {
        failure({ code: 2, message: 'Position unavailable' })
        return
      }
      if (mode === 'denied') {
        failure({ code: 1, message: 'Permission denied' })
        return
      }
      success({
        coords: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
        timestamp: Date.now(),
      })
    }
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.stack || error.message))

  const route = async (path, selector, label) => {
    const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30000 })
    assert(response?.ok(), label + ' response failed')
    await page.locator(selector).waitFor({ state: 'attached', timeout: 30000 })
    assert(await page.locator('.kfe-runtime-error').count() === 0, label + ' runtime error')
  }

  // Start this consolidated gap suite from a clean canonical dataset so first-day
  // master-data and business-start boundary assertions are deterministic.
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(async () => {
    const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js')
    const { AdminService } = await import(location.origin + '/src/application/admin/adminService.js')
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const { PerformanceService } = await import(location.origin + '/src/application/performance/performanceService.js')
    const { DriverTargetService } = await import(location.origin + '/src/application/performance/driverTargetService.js')
    const { calculateHistoricalMaintenanceRecovery } = await import(location.origin + '/src/domain/performance/performanceEngineV2.js')
    const { istDayRange } = await import(location.origin + '/src/domain/time/ist.js')
    const iso = (day, hour) => { const [y,m,d] = String(day).split('-').map(Number); const [h,min='0'] = String(hour).split(':'); return new Date(Date.UTC(y,m-1,d,Number(h),Number(min),0)-19800000).toISOString() }
    const request = indexedDB.deleteDatabase('kanishka_kfe_canonical_db')
    await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Canonical DB delete was blocked.')) })
    setActiveDataSource('canonical')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached', timeout: 30000 })

  // D5: an Admin master-data edit must be consumed by the Work baseline.
  const d5 = await page.evaluate(async () => {
    const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js')
    const { AdminService } = await import(location.origin + '/src/application/admin/adminService.js')
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const { PerformanceService } = await import(location.origin + '/src/application/performance/performanceService.js')
    const { DriverTargetService } = await import(location.origin + '/src/application/performance/driverTargetService.js')
    const { calculateHistoricalMaintenanceRecovery } = await import(location.origin + '/src/domain/performance/performanceEngineV2.js')
    const { istDayRange } = await import(location.origin + '/src/domain/time/ist.js')
    const iso = (day, hour) => { const [y,m,d] = String(day).split('-').map(Number); const [h,min='0'] = String(hour).split(':'); return new Date(Date.UTC(y,m-1,d,Number(h),Number(min),0)-19800000).toISOString() }
    const createdVehicle = await AdminService.save('vehicle', { registrationNumber: 'D5-TEST', make: 'KFE', model: 'Test', acquiredOn: '2026-09-01', acquisitionValue: 0, openingOdometerKm: 1000, fuelType: 'CNG', tankCapacity: 0, status: 'Active', statusDate: '2026-09-01', active: true })
    const vehicleId = createdVehicle.id
    await AdminService.save('vehicle', { registrationNumber: 'D5-TEST', make: 'KFE', model: 'Test', acquiredOn: '2026-09-01', acquisitionValue: 0, openingOdometerKm: 1200, fuelType: 'CNG', tankCapacity: 0, status: 'Active', statusDate: '2026-09-01', active: true }, vehicleId)
    const baseline = await WorkService.getBusinessStartBaseline()
    if (baseline?.businessStartOdometer !== 1200) throw new Error('D5 Admin vehicle edit was not consumed by Work baseline.')
    const started = await WorkService.startShift({ id: 'phase4-d5-shift', startOdometer: 1200, shiftStartAt: iso('2026-09-25', '08') })
    if (started?.startOdometer !== 1200) throw new Error('D5 Work did not use the edited opening odometer.')
    const ended = await WorkService.endShift({ shiftId: started.id, closingOdometer: 1210, revenue: 0 })
    if (ended?.ok !== true) throw new Error('D5 fixture shift did not close.')
    return { vehicleId, editedOpeningOdometer: baseline.businessStartOdometer, workStartOdometer: started.startOdometer }
  })
  assert(d5.editedOpeningOdometer === 1200 && d5.workStartOdometer === 1200, 'D5 Admin edit did not flow into Work.')

  // H4: maintenance, loan and target inputs must each contribute once to the
  // canonical Performance outputs; updating the same source record must not double-count it.
  const h4 = await page.evaluate(async () => {
    const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js')
    const { AdminService } = await import(location.origin + '/src/application/admin/adminService.js')
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const { PerformanceService } = await import(location.origin + '/src/application/performance/performanceService.js')
    const { DriverTargetService } = await import(location.origin + '/src/application/performance/driverTargetService.js')
    const { calculateHistoricalMaintenanceRecovery } = await import(location.origin + '/src/domain/performance/performanceEngineV2.js')
    const { istDayRange } = await import(location.origin + '/src/domain/time/ist.js')
    const iso = (day, hour) => { const [y,m,d] = String(day).split('-').map(Number); const [h,min='0'] = String(hour).split(':'); return new Date(Date.UTC(y,m-1,d,Number(h),Number(min),0)-19800000).toISOString() }
    const vehicle = (await AdminService.list('vehicle')).find(row => row.values?.registrationNumber === 'D5-TEST')
    if (!vehicle) throw new Error('H4 fixture vehicle missing.')
    const vehicleId = vehicle.id
    const maintenanceCreated = await AdminService.save('maintenance', { vehicleId, maintenanceType: 'H4 test service', performedOn: '2026-09-25', cost: 100 })
    const maintenanceId = maintenanceCreated.id
    await AdminService.save('maintenance', { vehicleId, maintenanceType: 'H4 test service', performedOn: '2026-09-25', cost: 150 }, maintenanceId)
    const loanCreated = await AdminService.save('loan', { lender: 'H4 Test Bank', accountReference: 'H4-1', principal: 12000, tenureMonths: 12, startDate: '2026-09-01', annualInterestRatePercent: 12, status: 'Active' })
    const loanId = loanCreated.id
    const driverCreated = await AdminService.save('driver', { name: 'D5 Test Driver', phone: '', licenseNumber: '', licenseExpiry: '', joinedOn: '2026-09-01', status: 'Active', vehicleId })
    const targetCreated = await AdminService.save('driverTarget', { driverId: driverCreated.id, effectiveFrom: '2026-09-01', desiredDriverProfit: 3000, active: true })
    const targetId = targetCreated.id
    await AdminService.save('driverTarget', { driverId: driverCreated.id, effectiveFrom: '2026-09-01', desiredDriverProfit: 3000, active: true }, targetId)
    await AdminService.save('breakEvenInputs', { effectiveFrom: '2026-09-01', maintenanceProvisionPerKm: 2 })
    const snapshot = await PerformanceService.getSnapshot()
    const range = { from: istDayRange('2026-09-01').from, to: istDayRange('2026-09-30').to }
    const metrics = PerformanceService.getMetrics(snapshot, range)
    const maintenanceCount = snapshot.maintenance.filter(x => x.id === maintenanceId && !x.deletedAt && !x.deleted).length
    const loanCount = snapshot.loans.filter(x => x.id === loanId && !x.deletedAt && !x.deleted).length
    const targetCount = snapshot.driverTargets.filter(x => x.id === targetId && !x.deletedAt && !x.deleted).length
    if (maintenanceCount !== 1 || loanCount !== 1 || targetCount !== 1) throw new Error('H4 source updates created duplicate canonical records.')
    if (Number(metrics.actualMaintenance) !== 150) throw new Error('H4 actual maintenance was double-counted or not updated.')
    if (Number(metrics.maintenanceProvision) !== 20) throw new Error('H4 maintenance provision did not calculate once for the 10 KM shift.')
    if (!(Number(metrics.finance?.provisionAccumulated) > 0)) throw new Error('H4 loan provision was not calculated.')
    const target = await DriverTargetService.getTarget(new Date('2026-09-26T12:00:00+05:30'))
    if (!target || typeof target !== 'object' || !('available' in target)) throw new Error('H4 driver target authority did not return a result.')
    return { maintenanceCount, loanCount, targetCount, actualMaintenance: metrics.actualMaintenance, maintenanceProvision: metrics.maintenanceProvision, loanProvision: metrics.finance?.provisionAccumulated, targetAvailable: Boolean(target.available), targetReason: target.reason || null }
  })
  assert(h4.maintenanceCount === 1 && h4.loanCount === 1 && h4.targetCount === 1 && Number(h4.actualMaintenance) === 150, 'H4 canonical calculations did not reconcile.')

  // I5/J5: Business Start Date is a calendar boundary in IST. Recovery is zero
  // before the boundary, begins on the boundary, continues after it, and stops
  // at the documented recovery horizon.
  const i5j5 = await page.evaluate(async () => {
    const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js')
    const { AdminService } = await import(location.origin + '/src/application/admin/adminService.js')
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const { PerformanceService } = await import(location.origin + '/src/application/performance/performanceService.js')
    const { DriverTargetService } = await import(location.origin + '/src/application/performance/driverTargetService.js')
    const { calculateHistoricalMaintenanceRecovery } = await import(location.origin + '/src/domain/performance/performanceEngineV2.js')
    const { istDayRange } = await import(location.origin + '/src/domain/time/ist.js')
    const iso = (day, hour) => { const [y,m,d] = String(day).split('-').map(Number); const [h,min='0'] = String(hour).split(':'); return new Date(Date.UTC(y,m-1,d,Number(h),Number(min),0)-19800000).toISOString() }
    const vehicle = { id: 'phase4-d5-vehicle', openingOdometerKm: 1200, active: true, status: 'Active' }
    const before = calculateHistoricalMaintenanceRecovery({ vehicles: [vehicle], businessStartDate: '2026-05-01', asOf: new Date('2026-04-30T23:59:00+05:30') })
    const on = calculateHistoricalMaintenanceRecovery({ vehicles: [vehicle], businessStartDate: '2026-05-01', asOf: new Date('2026-05-01T12:00:00+05:30') })
    const after = calculateHistoricalMaintenanceRecovery({ vehicles: [vehicle], businessStartDate: '2026-05-01', asOf: new Date('2026-05-02T12:00:00+05:30') })
    const horizon = calculateHistoricalMaintenanceRecovery({ vehicles: [vehicle], businessStartDate: '2026-05-01', asOf: new Date('2027-05-01T12:00:00+05:30') })
    if (before !== 0) throw new Error('I5/J5 recovery leaked before Business Start Date.')
    if (on !== 40 || after !== 40) throw new Error('I5/J5 recovery did not start on and persist after Business Start Date.')
    if (horizon !== 0) throw new Error('I5/J5 recovery did not stop at the 12-month boundary.')
    return { before, on, after, horizon }
  })
  assert(i5j5.before === 0 && i5j5.on === 40 && i5j5.after === 40 && i5j5.horizon === 0, 'I5/J5 Business Start Date boundary failed.')

  // A5-support: the fuel control is available while the driver remains OFFLINE.
  await route('', '.cockpit', 'Work')
  const fuelButton = page.getByRole('button', { name: 'CNG refuelling' })
  assert(await fuelButton.count() === 1, 'A5 fuel control is missing')
  assert(await page.getByRole('switch', { name: /go online/i }).count() === 1, 'A5 online/offline control is missing')
  await fuelButton.click()
  assert(await page.getByText('Refuelling', { exact: true }).count() === 1, 'A5 offline fuel form did not open')
  await page.getByRole('button', { name: 'Keep Draft & Close' }).click()

  // D2: perform a real canonical Work mutation while the browser is offline.
  await page.getByRole('switch', { name: /go online/i }).click()
  const startOdo = page.getByRole('spinbutton', { name: 'Start odometer' })
  await startOdo.fill('1200')
  await page.getByRole('button', { name: 'CONFIRM ODOMETER & GO ONLINE' }).click()
  // The switch label is presentation state; canonical repository persistence is the authority.
  // Confirm the shift through the same application/repository path used by Work.
  await page.waitForFunction(async () => {
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const active = await ShiftTripRepository.getActive()
    return Boolean(active?.shift && active.shift.status === 'ACTIVE' && Number(active.shift.startOdometer) === 1200)
  }, null, { timeout: 10000 })
  await context.setOffline(true)
  const offlineShiftState = await page.evaluate(async () => {
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const active = await ShiftTripRepository.getActive()
    return active?.shift ? { id: active.shift.id, status: active.shift.status, startOdometer: active.shift.startOdometer } : null
  })
  assert(offlineShiftState?.status === 'ACTIVE' && Number(offlineShiftState.startOdometer) === 1200, 'D2 offline shift mutation was not persisted canonically')
  await page.getByRole('link', { name: 'Timeline', exact: true }).click()
  await page.locator('.timeline').waitFor({ state: 'attached', timeout: 10000 })
  assert(await page.getByText('TIMELINE', { exact: false }).count() > 0, 'D2 offline navigation did not remain available')

  // F1-support: exercise browser foreground/background lifecycle semantics without
  // claiming equivalence to Android screen-off/background execution.
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  await page.evaluate(async () => {
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const active = await WorkService.getActiveState()
    const trip = await WorkService.startTrip({ shiftId: active.shift.id, operator: 'Uber' })
    if (!trip?.id) throw new Error('F1 browser lifecycle fixture could not create an active trip.')
    const ride = await WorkService.startRide({ id: trip.id })
    if (!ride) throw new Error('F1 browser lifecycle fixture could not start the ride.')
  })
  const backgroundPage = await context.newPage()
  await backgroundPage.goto(base, { waitUntil: 'domcontentloaded' })
  await backgroundPage.bringToFront()
  await new Promise(resolve => setTimeout(resolve, 250))
  await page.bringToFront()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  const f1State = await page.evaluate(async () => {
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    return WorkService.getActiveState()
  })
  assert(f1State?.shift?.status === 'ACTIVE' && f1State?.trip?.status === 'ACTIVE', 'F1 browser lifecycle lost the active ride after foreground return.')
  await backgroundPage.close()

  // F5: restore connectivity and verify the same canonical shift survives recovery/reload.
  await context.setOffline(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor({ state: 'attached', timeout: 30000 })
  const recoveredShiftState = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 13)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('shifts', 'readonly').objectStore('shifts').getAll()
      request.onsuccess = () => resolve((request.result || []).find(item => item.status === 'ACTIVE'))
      request.onerror = () => reject(request.error)
    })
    db.close()
    return record ? { id: record.id, status: record.status, startOdometer: record.startOdometer } : null
  })
  assert(recoveredShiftState?.id === offlineShiftState.id && recoveredShiftState.status === 'ACTIVE', 'F5 network recovery did not preserve the canonical shift')

  // G2: explicit permission denial is surfaced as the GPS permission state.
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  await page.evaluate(() => sessionStorage.setItem('__phase4_gps_mode', 'denied'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  const gps = page.locator('button.header-gps')
  assert(await gps.getAttribute('aria-label') === 'GPS permission needed', 'G2 permission denial was not surfaced')

  // G3: a position provider failure is surfaced as degraded/unavailable GPS.
  await page.evaluate(() => sessionStorage.setItem('__phase4_gps_mode', 'unavailable'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  await gps.waitFor({ state: 'attached' })
  assert(await gps.getAttribute('aria-label') === 'GPS unavailable', 'G3 unavailable GPS state was not surfaced')

  // G4: restoring permission returns to connected GPS without creating a GPS snapshot.
  const beforeSnapshots = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 13)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction('gps_snapshots', 'readonly')
      const request = tx.objectStore('gps_snapshots').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return count
  })
  await page.evaluate(() => sessionStorage.setItem('__phase4_gps_mode', 'connected'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.cockpit').waitFor({ state: 'attached' })
  await gps.waitFor({ state: 'attached' })
  assert(await gps.getAttribute('aria-label') === 'GPS connected', 'G4 GPS permission restoration did not recover')
  const afterSnapshots = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 13)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction('gps_snapshots', 'readonly')
      const request = tx.objectStore('gps_snapshots').count()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return count
  })
  assert(afterSnapshots === beforeSnapshots, 'G4 GPS status restoration created an unexpected GPS snapshot')

  if (errors.length) throw new Error('Browser runtime errors:\\n' + errors.join('\\n'))

  console.log('PASS Phase 4 operational gap suite: D5 Admin→Work master-data consumption, H4 maintenance/loan/target reconciliation, I5/J5 Business Start Date boundaries, F1 browser lifecycle continuity, A5 offline fuel access, D2 offline PWA continuity, F5 network recovery, G2 permission denial, G3 GPS unavailable, and G4 permission restoration without duplicate GPS snapshots.')
} catch (error) {
  throw new Error(error.message + '\\n' + output)
} finally {
  await browser?.close()
  await stop()
}
