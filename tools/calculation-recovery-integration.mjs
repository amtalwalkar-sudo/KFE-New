import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const port = 4178
const base = `http://127.0.0.1:${port}`
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
  detached: true,
})
let serverOutput = ''
server.stdout.on('data', chunk => { serverOutput += chunk.toString() })
server.stderr.on('data', chunk => { serverOutput += chunk.toString() })
let browser
try {
  const deadline = Date.now() + 30000
  let ready = false
  while (Date.now() < deadline) {
    try { ready = (await fetch(base)).ok } catch (_) {}
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) throw new Error(`Vite dev server did not start.\n${serverOutput}`)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 19.01, longitude: 72.85, accuracy: 5 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.stack || error.message))
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForFunction(() => document.readyState === 'complete', undefined, { timeout: 15000 })

  const result = await page.evaluate(async () => {
    const [{ initializeCanonicalStorage }, { ShiftTripRepository }, { LocationRepository }, { WorkService }, { configureWorkRuntimePorts }, { FuelRepository }, { recordFuelEntry }, { completeEndShift }, { OperationalRecordService }, { PerformanceRepository }, { derivePerformance }, { BackupService }] = await Promise.all([
      import('/src/utils/indexedDB.js'),
      import('/src/repositories/shiftTripRepository.js'),
      import('/src/repositories/locationRepository.js'),
      import('/src/application/work/workService.js'),
      import('/src/application/work/workRuntimePorts.js'),
      import('/src/repositories/fuelRepository.js'),
      import('/src/application/work/fuel.js'),
      import('/src/application/work/endShift.js'),
      import('/src/application/timeline/operationalRecordService.js'),
      import('/src/repositories/performanceRepository.js'),
      import('/src/domain/performance/performanceEngineV2.js'),
      import('/src/application/backup/backupService.js'),
    ])
    const db = await initializeCanonicalStorage()
    const stores = ['shifts','trips','fuel_logs','vehicles','drivers','compliance_records','maintenance_records','loans','loan_payments','prepayments','driver_targets','break_even_inputs','settlements','settings','financial_period_snapshots','odoGaps','pending_mutations','days','gps_snapshots','movement_artifacts','audit_history']
    await new Promise((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite')
      for (const name of stores) tx.objectStore(name).clear()
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || new Error('Integration fixture reset aborted'))
    })
    const now = Date.now()
    const at = offset => new Date(now + offset).toISOString()
    const shift = await ShiftTripRepository.createShift({ startOdometer: 100, shiftStartAt: at(-3600000), openingPersonalKm: 0, openingDeadKm: 0 })
    const trip = await ShiftTripRepository.createTrip({ shiftId: shift.id, operator: 'Uber', tripStartAt: at(-3000000), tripKm: 40, tripStage: 'GOING_TO_PICKUP' })
    const started = await ShiftTripRepository.setTripStage(trip.id, 'RIDE_STARTED')
    if (!started) throw new Error('Trip stage did not persist')
    await ShiftTripRepository.completeTrip({ id: trip.id, tripEndAt: at(-2400000), tripKm: 40, revenue: 500 })
    // Exercise the real saved-ride completion/enrichment pipeline with an internal
    // GPS outage. All four points are persisted in IndexedDB, but the middle interval
    // is deliberately missing. A deterministic router refuses to estimate that gap.
    const { configureWorkRuntimePorts } = await import('/src/application/work/workRuntimePorts.js')
    const noOp = async () => true
    configureWorkRuntimePorts({
      movementTrace: { start: noOp, reset: noOp, getActiveSession: () => null, getPoints: () => [], stop: async () => [], resumePersisted: noOp, pause: noOp, getDistanceKm: () => 0 },
      nativeGps: { start: noOp, stop: noOp, readTrace: async () => [], syncTrace: async () => ({ imported: 0 }), getPermissionStatus: async () => ({ granted: true }), openAppSettings: noOp, listTraceOwners: async () => [] },
      nativeWorkActions: { clearPendingAction: noOp, addListener: () => ({ remove() {} }), consumePendingActions: async () => [], consumePendingAction: async () => null, acknowledgeAction: async () => ({ acknowledged: true }), recordActionFailure: noOp },
      canonicalWork: { putRecord: async input => ({ accepted: true, outcome: { record: input.record } }), getRecord: async () => ({ found: false }), listRecords: async () => ({ records: [], count: 0 }), getOperation: async () => ({ found: false }), isAvailable: () => false },
      androidOverlay: { hide: noOp, update: noOp, prepare: noOp, fareSaved: noOp, cancelSaved: noOp },
      routing: { createRouter: () => ({ routeTrace: async () => null }) },
      platform: { getPlatform: () => 'web' },
    })
    const gapStartAt = at(-900000)
    const gapEndAt = at(-300000)
    const gapTrip = await ShiftTripRepository.createTrip({ shiftId: shift.id, operator: 'Uber', tripStartAt: gapStartAt, tripKm: 0, revenue: 350 })
    if (!await ShiftTripRepository.setTripStage(gapTrip.id, 'RIDE_STARTED')) throw new Error('Gap-test ride did not enter passenger-ride phase')
    const gapPoints = [
      { latitude: 19.0100, longitude: 72.8500, accuracy: 8, speed: 8, capturedAt: at(-895000) },
      { latitude: 19.0200, longitude: 72.8600, accuracy: 8, speed: 8, capturedAt: at(-840000) },
      { latitude: 19.0700, longitude: 72.9100, accuracy: 8, speed: 8, capturedAt: at(-360000) },
      { latitude: 19.0800, longitude: 72.9200, accuracy: 8, speed: 8, capturedAt: at(-305000) },
    ]
    for (const point of gapPoints) {
      await LocationRepository.recordTracePoint({ entityType: 'TRIP', entityId: gapTrip.id, eventType: 'PASSENGER_RIDE_TRACE', ...point })
    }
    let resolveGapEnrichment
    const gapEnrichmentDone = new Promise(resolve => { resolveGapEnrichment = resolve })
    const originalEnrichTripMovement = ShiftTripRepository.enrichTripMovement
    ShiftTripRepository.enrichTripMovement = async function (record) {
      const saved = await originalEnrichTripMovement.call(ShiftTripRepository, record)
      if (record.id === gapTrip.id) resolveGapEnrichment(record)
      return saved
    }
    try {
      await WorkService.completeTrip({ id: gapTrip.id, tripEndAt: gapEndAt, revenue: 350 })
      await Promise.race([
        gapEnrichmentDone,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Saved-ride GPS enrichment did not finish within 15 seconds')), 15000)),
      ])
    } finally {
      ShiftTripRepository.enrichTripMovement = originalEnrichTripMovement
    }
    const savedGapTrip = (await ShiftTripRepository.getTripsForShift(shift.id)).find(item => item.id === gapTrip.id)
    const gapProvenance = savedGapTrip?.tripKmProvenance
    if (savedGapTrip?.tripKmAuthority !== 'GPS_TRACE_INCOMPLETE') throw new Error('Saved ride did not persist GPS_TRACE_INCOMPLETE authority')
    if (gapProvenance?.gpsRecordingStatus !== 'INCOMPLETE' || gapProvenance?.recordingGapDetected !== true) throw new Error('Saved ride did not persist its incomplete-recording marker')
    if (gapProvenance?.incompleteKmSegments?.length !== 1 || gapProvenance.incompleteKmSegments[0].status !== 'UNRESOLVED') throw new Error('Unroutable GPS outage must remain an unresolved segment')
    if (!(gapProvenance.knownDistanceKm > 0) || gapProvenance.estimatedGapDistanceKm !== 0 || gapProvenance.unresolvedGapCount !== 1) throw new Error('Known ride sections and unresolved gap accounting diverged')
    if (!(savedGapTrip.tripKm > 0 && savedGapTrip.tripKm < 5)) throw new Error('Saved trip KM appears to include the straight-line outage chord')
    if (savedGapTrip.roadMatchedGeometry !== null || (savedGapTrip.traceGeometry || []).length !== 0) throw new Error('Saved ride must not draw a continuous route across the GPS outage')

    const movementReconciliation = {
      reconciliationStatus: 'RECONCILED',
      segments: [
        { id: 'business', classification: 'BUSINESS', distanceKm: 40 },
        { id: 'dead', classification: 'DEAD', distanceKm: 30 },
        { id: 'cancelled', classification: 'CANCELLED', distanceKm: 10 },
        { id: 'unclassified', classification: 'UNCLASSIFIED', distanceKm: 20 },
      ],
    }
    const closeResult = await completeEndShift({
      shiftId: shift.id, closingOdometer: 200, movementReconciliation,
    })
    if (!closeResult.ok) throw new Error(`End Shift application flow failed: ${closeResult.reason}`)
    // End Shift is intentionally odometer-only. Fare corrections are saved through
    // the trip record workflow, which recalculates financial read models separately.
    await ShiftTripRepository.updateTrip({ id: trip.id, revenue: null })
    const afterClose = await ShiftTripRepository.getTripsForShift(shift.id)
    const correctedTrip = afterClose.find(item => item.id === trip.id)
    const closedShift = (await ShiftTripRepository.getAllShifts()).find(item => item.id === shift.id)
    if (correctedTrip.revenue !== null) throw new Error('Fare clear was not persisted as null')
    if (closedShift.revenueReconciliation?.unpricedTrips !== 1) throw new Error('Trip fare edit did not refresh financial reconciliation after shift close')

    const fuel = await recordFuelEntry({ odometer: 150, pricePerKg: 75, amount: 300, isFullTank: false })
    if (!fuel.ok || !fuel.record?.vehicleId) throw new Error('Fuel record did not persist with canonical vehicle link')
    let changeObserved = false
    const unsubscribe = (await import('/src/repositories/canonicalDataChangeRepository.js')).subscribeCanonicalDataChanges(change => {
      if (change.stores?.includes('fuel_logs')) changeObserved = true
    })
    await FuelRepository.update(fuel.record.id, { amount: 375 })
    await new Promise(resolve => setTimeout(resolve, 0))
    unsubscribe()
    if (!changeObserved) throw new Error('Fuel update did not invalidate canonical read models')

    const operational = await OperationalRecordService.reconstructShift(shift.id)
    if (operational.fuelCost !== 375 || operational.fuelQuantityKg !== 5) throw new Error('Timeline read model did not consume edited canonical fuel values')
    if (operational.businessKm !== 40 || operational.deadKm !== 30 || operational.cancelledKm !== 10 || operational.unclassifiedKm !== 20) {
      throw new Error('Timeline read model diverged from persisted movement reconciliation')
    }
    const snapshot = await PerformanceRepository.getSnapshot()
    const range = { from: new Date(now - 86400000), to: new Date(now + 86400000) }
    const performance = derivePerformance(snapshot, range)
    if (performance.businessKm !== operational.businessKm || performance.deadKm !== operational.deadKm ||
        performance.cancelledKm !== operational.cancelledKm || performance.unclassifiedKm !== operational.unclassifiedKm) {
      throw new Error('Performance calculation diverged from Timeline movement authority')
    }

    const backup = await BackupService.createBackup()
    BackupService.registerCloudBackupProvider({
      name: 'integration-test',
      async upload(value) { return { ok: true, recordCount: Object.values(value.stores).reduce((sum, rows) => sum + rows.length, 0) } },
      async download() { return backup },
    })
    await BackupService.restoreFromCloud()
    const restoredShift = (await ShiftTripRepository.getAllShifts()).find(item => item.id === shift.id)
    const restoredFuel = (await FuelRepository.getAll()).find(item => item.id === fuel.record.id)
    if (!restoredShift || !restoredFuel || restoredFuel.amount !== 375) throw new Error('Cloud-restore path did not restore canonical shift and edited fuel records')
    const restoredOperational = await OperationalRecordService.reconstructShift(shift.id)
    if (restoredOperational.fuelCost !== 375 || restoredOperational.unclassifiedKm !== 20) throw new Error('Downstream read model did not consume restored canonical records')
    return {
      shiftId: shift.id,
      tripId: trip.id,
      fuelId: fuel.record.id,
      fareClearPersisted: correctedTrip.revenue === null,
      postCloseTripEditReconciliation: closedShift.revenueReconciliation.unpricedTrips === 1,
      canonicalChangeInvalidation: changeObserved,
      timelineAndPerformanceMovementAgreement: true,
      cloudRestoreAndDownstreamRecalculation: true,
    }
  })
  assert.equal(result.fareClearPersisted, true)
  assert.equal(result.postCloseTripEditReconciliation, true)
  assert.equal(result.canonicalChangeInvalidation, true)
  assert.equal(result.timelineAndPerformanceMovementAgreement, true)
  assert.equal(result.cloudRestoreAndDownstreamRecalculation, true)
  if (pageErrors.length) throw new Error(`Browser errors during canonical integration test:\n${pageErrors.join('\n\n')}`)
  console.log('Canonical persistence/calculation/restore integration: PASS')
  console.log(JSON.stringify(result))
  await context.close()
} finally {
  await browser?.close()
  if (server.pid) {
    try { process.kill(-server.pid, 'SIGTERM') } catch (_) { try { server.kill('SIGTERM') } catch (_) {} }
    await new Promise(resolve => setTimeout(resolve, 300))
    try { process.kill(-server.pid, 'SIGKILL') } catch (_) {}
  }
}
