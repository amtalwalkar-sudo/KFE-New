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

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.stack || error.message))

  const route = async (path, selector, label) => {
    const target = path ? new URL(path.replace(/^\//, ''), base).href : base
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (response) assert(response.ok(), label + ' response failed')
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
    // The consolidated gap suite owns its clean canonical fixture. Mark first-run onboarding
    // complete before reload so the fixture reaches the Work route rather than the production
    // first-run screen; this does not seed business/master data or bypass any Work assertions.
    const { AdminRepository } = await import(location.origin + '/src/repositories/adminRepository.js')
    await AdminRepository.saveSetting('kfe-first-run-setup', 'firstRunSetup', { version: 1, status: 'completed', steps: {}, completedAt: new Date().toISOString() })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.work-canonical').waitFor({ state: 'attached', timeout: 30000 })

  // VEHICLE IDENTITY: the one current car has a stable master ID, and legacy
  // fuel logs without vehicleId are linked to that car before calculations.
  const vehicleFuelLink = await page.evaluate(async () => {
    const { initializeCanonicalStorage } = await import(location.origin + '/src/utils/indexedDB.js')
    const { ShiftTripRepository } = await import(location.origin + '/src/repositories/shiftTripRepository.js')
    const db = await initializeCanonicalStorage()
    const fixtureId = 'phase4-mh01em7360-unlinked-fuel'
    const now = new Date().toISOString()
    await new Promise((resolve, reject) => {
      const tx = db.transaction('fuel_logs', 'readwrite')
      tx.objectStore('fuel_logs').put({
        id: fixtureId, odometer: 12345, pricePerKg: 80, amount: 160,
        quantityKg: 2, isFullTank: true, capturedAt: now, createdAt: now, updatedAt: now
      })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Could not seed unlinked fuel fixture.'))
      tx.onabort = () => reject(tx.error || new Error('Unlinked fuel fixture transaction aborted.'))
    })
    const vehicleId = await ShiftTripRepository.getPrimaryVehicleId()
    const [vehicle, linkedFuel] = await Promise.all([
      new Promise((resolve, reject) => {
        const request = db.transaction('vehicles', 'readonly').objectStore('vehicles').get(vehicleId)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      }),
      new Promise((resolve, reject) => {
        const request = db.transaction('fuel_logs', 'readonly').objectStore('fuel_logs').get(fixtureId)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })
    ])
    await new Promise((resolve, reject) => {
      const tx = db.transaction('fuel_logs', 'readwrite')
      tx.objectStore('fuel_logs').delete(fixtureId)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('Could not clean fuel fixture.'))
    })
    return { vehicleId, registrationNumber: vehicle?.registrationNumber, registration_number: vehicle?.registration_number, linkedFuelVehicleId: linkedFuel?.vehicleId }
  })
  assert(vehicleFuelLink.vehicleId === 'vehicle-mh01em7360', 'Primary vehicle did not use the stable MH01EM7360 identity.')
  assert(vehicleFuelLink.registrationNumber === 'MH01EM7360' || vehicleFuelLink.registration_number === 'MH01EM7360', 'Primary vehicle master is missing registration MH01EM7360.')
  assert(vehicleFuelLink.linkedFuelVehicleId === vehicleFuelLink.vehicleId, 'Legacy fuel record was not linked to MH01EM7360.')

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
    const maintenanceCreated = await AdminService.save('maintenance', { maintenanceType: 'H4 test service', performedOn: '2026-09-25', odometerKm: 1205, cost: 100 })
    const maintenanceId = maintenanceCreated.id
    await AdminService.save('maintenance', { maintenanceType: 'H4 test service', performedOn: '2026-09-25', odometerKm: 1205, cost: 150 }, maintenanceId)
    const loanCreated = await AdminService.save('loan', { lender: 'H4 Test Bank', accountReference: 'H4-1', principal: 12000, tenureMonths: 12, startDate: '2026-09-01', annualInterestRatePercent: 12, status: 'Active' })
    const loanId = loanCreated.id
    const driverCreated = await AdminService.save('driver', { name: 'D5 Test Driver', phone: '', licenseNumber: '', licenseExpiry: '', joinedOn: '2026-09-01', status: 'Active', vehicleId })
    const targetCreated = await AdminService.save('driverTarget', { driverId: driverCreated.id, effectiveFrom: '2026-09-01', desiredDriverProfit: 3000, active: true })
    const targetId = targetCreated.id
    await AdminService.save('driverTarget', { driverId: driverCreated.id, effectiveFrom: '2026-09-01', desiredDriverProfit: 3000, active: true }, targetId)
    await AdminService.save('breakEvenInputs', { effectiveFrom: '2026-09-01', maintenanceProvisionPerKm: 2 })
    const snapshot = await PerformanceService.getSnapshot()
    const range = { from: istDayRange('2026-09-01').from, to: istDayRange('2026-10-31').to }
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

  // ADMIN FIELD ROUND-TRIP: create, edit, list/reload and verify canonical values for
  // every Admin form. This exercises the real browser IndexedDB repositories, not a
  // mocked store. The matrix asserts source fields only; derived values remain derived.
  const adminRoundTrip = await page.evaluate(async () => {
    const { AdminService } = await import(location.origin + '/src/application/admin/adminService.js')
    const cases = [
      ['businessSetup', { businessStartDate: '2026-09-01', notes: 'Admin matrix initial' }, { notes: 'Admin matrix edited' }, { notes: 'Admin matrix edited' }],
      ['vehicle', { registrationNumber: 'ADM-MATRIX-1', make: 'KFE', model: 'Matrix', variant: 'V1', acquiredOn: '2026-09-01', acquisitionValue: 500000, openingOdometerKm: 1200, fuelType: 'CNG', tankCapacity: 12, status: 'Active', statusDate: '2026-09-01', expiryDate: '2027-09-01', sellPrice: '', saleDate: '', active: true, notes: 'Vehicle initial' }, { openingOdometerKm: 1201, notes: 'Vehicle edited' }, { openingOdometerKm: 1201, notes: 'Vehicle edited' }],
      ['driver', { name: 'Admin Matrix Driver', phone: '9000000001', licenseNumber: 'ADM-LIC-1', licenseExpiry: '2027-09-01', joinedOn: '2026-09-01', status: 'Active', vehicleId: '', notes: 'Driver initial' }, { phone: '9000000002', notes: 'Driver edited' }, { phone: '9000000002', notes: 'Driver edited' }],
      ['compliance', { vehicleId: '', complianceType: 'Admin Matrix PUC', validFrom: '2026-09-01', validUntil: '2027-09-01', cost: 250 }, { cost: 275 }, { cost: 275 }],
      ['maintenance', { performedOn: '2026-09-02', odometerKm: 1205, maintenanceType: 'Admin Matrix Service', cost: 150, notes: 'Maintenance initial' }, { cost: 175, notes: 'Maintenance edited' }, { cost: 175, notes: 'Maintenance edited' }],
      ['loan', { lender: 'Admin Matrix Bank', accountReference: 'ADM-LOAN-1', principal: 12000, tenureMonths: 12, startDate: '2026-09-01', annualInterestRatePercent: 12, status: 'Active', notes: 'Loan initial' }, { notes: 'Loan edited' }, { notes: 'Loan edited' }],
      ['loanPayment', { loanId: '', paidOn: '2026-10-02', amount: 100, notes: 'Loan payment initial' }, { notes: 'Loan payment edited' }, { notes: 'Loan payment edited' }],
      ['prepayment', { loanId: '', paidOn: '2026-09-15', amount: 100, reason: 'Admin matrix', notes: 'Prepayment initial' }, { notes: 'Prepayment edited' }, { notes: 'Prepayment edited' }],
      ['settlement', { settlementType: 'Payment', sourceType: 'Maintenance', sourceId: '', settledOn: '2026-09-03', amount: 50, paymentMethod: 'UPI', referenceNumber: 'ADM-SET-1', notes: 'Settlement initial' }, { amount: 60, notes: 'Settlement edited' }, { amount: 60, notes: 'Settlement edited' }],
      ['driverTarget', { driverId: '', effectiveFrom: '2026-09-01', desiredDriverProfit: 3000, active: true, notes: 'Target initial' }, { desiredDriverProfit: 3100, notes: 'Target edited' }, { desiredDriverProfit: 3100, notes: 'Target edited' }],
      ['breakEvenInputs', { effectiveFrom: '2026-09-01', maintenanceProvisionPerKm: 2.25, notes: 'Rate initial' }, { maintenanceProvisionPerKm: 2.5, notes: 'Rate edited' }, { maintenanceProvisionPerKm: 2.5, notes: 'Rate edited' }],
    ]
    const saved = {}
    for (const [key, initial, edits, expected] of cases) {
      const definition = AdminService.getDefinition(key)
      const values = { ...initial }
      if (key === 'driver') {
        const vehicle = (await AdminService.list('vehicle')).find(row => row.values?.registrationNumber === 'ADM-MATRIX-1')
        values.vehicleId = vehicle.id
      }
      if (key === 'compliance') {
        const vehicle = (await AdminService.list('vehicle')).find(row => row.values?.registrationNumber === 'ADM-MATRIX-1')
        values.vehicleId = vehicle.id
      }
      if (key === 'loanPayment' || key === 'prepayment') {
        const loan = saved.loan
        values.loanId = loan.id
      }
      if (key === 'driverTarget') {
        const driver = saved.driver
        values.driverId = driver.id
      }
      if (key === 'settlement') {
        const maintenance = saved.maintenance
        values.sourceId = maintenance.id
      }
      // Assert that each submitted key is part of the frozen form contract; this
      // prevents the round-trip test from silently adding undocumented inputs.
      const allowed = new Set(definition.fields.map(field => field.key))
      for (const field of Object.keys(values)) if (!allowed.has(field)) throw new Error(key + ': unregistered source field ' + field)
      const created = await AdminService.save(key, values)
      const updated = await AdminService.save(key, { ...values, ...edits }, created.id)
      const reread = (await AdminService.list(key)).find(row => row.id === created.id)
      if (!reread) throw new Error(key + ': edited record missing from repository list/reload')
      for (const [field, expectedValue] of Object.entries(expected)) {
        if (reread.values?.[field] !== expectedValue) throw new Error(key + '.' + field + ': round-trip mismatch; expected ' + expectedValue + ', got ' + reread.values?.[field])
      }
      saved[key] = updated
    }
    // Soft-delete is part of the Admin contract: deletion must be auditable and
    // remove the record from normal list/read models without physically erasing it.
    const settlementId = saved.settlement.id
    await AdminService.remove('settlement', settlementId)
    if ((await AdminService.list('settlement')).some(row => row.id === settlementId)) throw new Error('settlement soft-delete still appears in active list')
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 16)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const deletedRecord = await new Promise((resolve, reject) => {
      const request = db.transaction('settlements', 'readonly').objectStore('settlements').get(settlementId)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (!deletedRecord?.deletedAt || deletedRecord.deleted !== true) throw new Error('settlement delete did not persist soft-delete metadata')
    return { forms: cases.length, createdEditedReloaded: cases.map(([key]) => key), softDeleteVerified: true, deletedSettlementId: settlementId }
  })
  assert(adminRoundTrip.forms === 11 && adminRoundTrip.softDeleteVerified, 'Admin field round-trip matrix failed.')
  console.log('PASS Admin field round-trip audit: ' + adminRoundTrip.forms + ' forms saved, edited, reread; settlement soft-delete persisted.')

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
  await route('', '.work-canonical', 'Work')
  const fuelButton = page.getByRole('button', { name: 'CNG refuelling' })
  assert(await fuelButton.count() === 1, 'A5 fuel control is missing')
  assert(await page.getByRole('button', { name: 'OFFLINE', exact: true }).count() === 1, 'A5 online/offline control is missing')
  await fuelButton.click()
  const fuelForm = page.locator('.work-context-form.form-fuel .form-card')
  await fuelForm.waitFor({ state: 'visible', timeout: 5000 })
  assert(await page.locator('.work-context-form.form-fuel').count() === 1, 'A5 offline fuel form did not open')
  assert(await page.getByText('CNG REFUEL', { exact: true }).count() === 0, 'A5 duplicate fuel heading should be removed')
  assert(await page.getByText('Partial fill', { exact: true }).count() === 1, 'A5 partial-fill control is missing')
  assert(await page.locator('.fuel-calculated-value.state-tone-info').count() === 1, 'A5 calculated Quantity does not use the semantic info tone')
  await page.getByRole('textbox', { name: 'Odometer' }).click()
  const fuelKeypad = page.locator('.work-context-form.form-fuel .kfe-work-number-pad')
  await fuelKeypad.waitFor({ state: 'visible', timeout: 5000 })
  const fuelViewport = await page.evaluate(() => {
    const form = document.querySelector('.work-context-form.form-fuel .form-card')?.getBoundingClientRect()
    const keypad = document.querySelector('.work-context-form.form-fuel .kfe-work-number-pad')?.getBoundingClientRect()
    const header = document.querySelector('.work-header')?.getBoundingClientRect()
    const nav = document.querySelector('.kfe-bottom-nav')?.getBoundingClientRect()
    return {
      formTop: form?.top ?? Infinity,
      keypadBottom: keypad?.bottom ?? Infinity,
      headerBottom: header?.bottom ?? 0,
      navTop: nav?.top ?? window.innerHeight,
      viewportHeight: window.innerHeight,
    }
  })
  assert(fuelViewport.formTop >= fuelViewport.headerBottom, 'A5 fuel form overlaps the Work header')
  assert(fuelViewport.keypadBottom <= fuelViewport.navTop && fuelViewport.keypadBottom <= fuelViewport.viewportHeight, 'A5 full fuel form and keypad do not fit above bottom navigation')
  await page.getByRole('button', { name: 'Close fuel form' }).click()
  assert(await page.locator('.work-context-form.form-fuel').count() === 0, 'A5 fuel form Close control did not close the form')

  await page.evaluate(async () => { const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js'); setActiveDataSource('canonical') })
  // D2: create a deterministic canonical Work fixture while online, then perform a
  // real canonical trip mutation while the browser is offline. The shift fixture is
  // created through the application service so this test does not depend on transient
  // cockpit UI state from earlier scenarios.
  const offlineShiftState = await page.evaluate(async () => {
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    const shift = await WorkService.startShift({ id: 'phase4-d2-offline-shift', startOdometer: 1200 })
    if (!shift?.id || shift.status !== 'ACTIVE' || Number(shift.startOdometer) !== 1200) {
      throw new Error('D2 could not create the canonical active shift fixture')
    }
    return { id: shift.id, status: shift.status, startOdometer: shift.startOdometer }
  })

  // Preload the repository module while online. The actual mutation below runs
  // after network access is disabled, so the test exercises true offline persistence.
  await page.evaluate(async () => {
    window.__phase4ShiftTripRepository = await import(location.origin + '/src/repositories/shiftTripRepository.js')
  })
  await context.setOffline(true)
  const offlineTripState = await page.evaluate(async () => {
    const repo = window.__phase4ShiftTripRepository.ShiftTripRepository
    const active = await repo.getActive()
    if (!active?.shift?.id || active.shift.id !== 'phase4-d2-offline-shift') {
      throw new Error('D2 canonical active shift fixture missing before offline mutation')
    }
    const trip = await repo.createTrip({ id: 'phase4-d2-offline-trip', shiftId: active.shift.id, operator: 'Uber', tripStage: 'PICKUP' })
    if (!trip?.id) throw new Error('D2 could not create offline fixture trip')
    const updated = await repo.setTripStage(trip.id, 'RIDE_STARTED')
    if (!updated || updated.id !== trip.id || updated.tripStage !== 'RIDE_STARTED') throw new Error('D2 offline canonical trip mutation was rejected')
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 16)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('trips', 'readonly').objectStore('trips').get(trip.id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return record ? { id: record.id, status: record.status, tripStage: record.tripStage, shiftId: record.shiftId } : null
  })
  assert(
    offlineTripState?.status === 'ACTIVE' &&
      offlineTripState.tripStage === 'RIDE_STARTED' &&
      offlineTripState.shiftId === offlineShiftState.id,
    'D2 offline canonical trip mutation was not persisted'
  )

  // Finish the D2 fixture before the independent F1 lifecycle scenario. Leaving
  // this trip active would correctly trigger the single-active-trip invariant and
  // make F1 accidentally test fixture leakage rather than page lifecycle recovery.
  await page.evaluate(async () => {
    const repo = window.__phase4ShiftTripRepository.ShiftTripRepository
    const completed = await repo.completeTrip({ id: 'phase4-d2-offline-trip' })
    if (!completed) throw new Error('D2 fixture trip could not be completed before the next lifecycle scenario')
  })

  // D2 intentionally keeps the browser offline only for the canonical mutation check.
  // Do not navigate to a lazily loaded route here: offline route-chunk loading would
  // test the bundler/cache strategy rather than canonical mutation persistence.

  // Restore connectivity before the next lifecycle scenario; D2 intentionally leaves
  // the browser offline to prove canonical mutation persistence.
  await context.setOffline(false)

  // F1-support: exercise browser foreground/background lifecycle semantics without
  // claiming equivalence to Android screen-off/background execution.
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.work-canonical').waitFor({ state: 'attached' })
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
  await page.locator('.work-canonical').waitFor({ state: 'attached' })
  const f1State = await page.evaluate(async () => {
    const { WorkService } = await import(location.origin + '/src/application/work/workService.js')
    return WorkService.getActiveState()
  })
  assert(f1State?.shift?.status === 'ACTIVE' && f1State?.trip?.status === 'ACTIVE', 'F1 browser lifecycle lost the active ride after foreground return.')
  await backgroundPage.close()

  // F5: restore connectivity and verify the same canonical shift survives recovery/reload.
  await context.setOffline(false)
  // F5 recovery also guards the read-only reporting routes: both Timeline and Performance
  // must mount their current projections without mutating canonical operational state.
  await route('timeline', '.activity-timeline-page', 'Timeline')
  await page.locator('.activity-timeline-page').waitFor({ state: 'visible', timeout: 30000 })
  assert(await page.getByText('Average fuel cost/km', { exact: true }).count() === 1, 'Timeline fuel cost/km header is missing')
  assert(await page.getByText('Total amount refilled', { exact: true }).count() === 1, 'Timeline refilled amount header is missing')
  assert(await page.locator('.performance-page').count() === 0, 'Timeline mounted retired Performance presentation.')
  await route('performance', '.performance-page', 'Performance dashboard')
  await page.locator('.performance-page').waitFor({ state: 'visible', timeout: 30000 })
  assert(await page.locator('.performance-page').count() === 1, 'Performance dashboard did not render.')
  assert(await page.getByRole('heading', { name: 'Performance' }).count() === 1, 'Performance title is missing.')
  assert(await page.getByRole('combobox', { name: 'Performance period' }).count() === 1, 'Performance period filter is missing.')
  for (const label of ['Timeline', 'Performance']) assert(await page.locator('.bottom-nav').getByText(label, { exact: true }).count(), 'Bottom navigation must retain ' + label)
  const recoveredShiftState = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kanishka_kfe_canonical_db', 16)
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

  // G2: browser location permission is requested only for a trip boundary, not at startup.
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.locator('.work-canonical').waitFor({ state: 'attached' })
  assert(await page.locator('button.header-gps').count() === 0, 'GPS status UI should be removed with continuous tracking')
  assert(await page.locator('.kfe-permission-gate').count() === 0, 'Denied or unrequested browser location must not block non-GPS work surfaces')

  // G3: a one-shot provider failure is a missing snapshot, not a blocked lifecycle.
  const unavailableSnapshot = await page.evaluate(async () => {
    const original = navigator.geolocation
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_success, failure) { failure({ code: 2, message: 'simulated offline GPS unavailable' }) }
    } })
    try {
      const { captureTripBoundaryLocation } = await import('/src/application/work/tripBoundaryLocation.js')
      return await captureTripBoundaryLocation()
    } finally {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: original })
    }
  })
  assert(unavailableSnapshot === null, 'Unavailable one-shot GPS should degrade to a missing snapshot without blocking work')

  // G4: app startup and permission restoration must not capture location by themselves.
  const boundarySnapshotKeys = async () => page.evaluate(async () => {
    const { ShiftTripRepository } = await import('/src/repositories/shiftTripRepository.js')
    const trips = await ShiftTripRepository.getAllTrips()
    return trips.flatMap(trip => [
      ['tripStartLocation', trip.tripStartLocation],
      ['tripEndLocation', trip.tripEndLocation]
    ].filter(([, snapshot]) => snapshot?.capturedAt).map(([field, snapshot]) => [trip.id, field, snapshot.capturedAt].join('|'))).sort()
  })
  const beforeBoundarySnapshots = await boundarySnapshotKeys()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.work-canonical').waitFor({ state: 'attached' })
  const afterBoundarySnapshots = await boundarySnapshotKeys()
  assert(JSON.stringify(afterBoundarySnapshots) === JSON.stringify(beforeBoundarySnapshots), 'Startup must not create GPS snapshots outside trip boundaries')
  if (errors.length) throw new Error('Browser runtime errors:\\n' + errors.join('\\n'))

  console.log('PASS Phase 4 operational gap suite: D5 Admin→Work master-data consumption, H4 maintenance/loan/target reconciliation, I5/J5 Business Start Date boundaries, F1 browser lifecycle continuity, A5 offline fuel access, D2 offline PWA continuity, F5 network recovery, G2 no startup location gate, G3 safe one-shot GPS failure, and G4 no startup snapshots.')
} catch (error) {
  throw new Error(error.message + '\\n' + output)
} finally {
  await browser?.close()
  await stop()
}
