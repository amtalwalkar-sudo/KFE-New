import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4174/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4174'], {
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
  throw new Error('Persistence recovery dev server did not start.\n' + output)
}
const stop = async () => {
  if (!dev.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch (_) {}
  await new Promise(resolve => setTimeout(resolve, 400))
}
const run = async page => page.evaluate(async () => {
  const { setActiveDataSource, openCanonicalDB } = await import('/src/utils/indexedDB.js')
  const { FuelRepository } = await import('/src/repositories/fuelRepository.js')
  const { MutationRepository } = await import('/src/repositories/mutationRepository.js')
  const { createBackupRepository } = await import('/src/repositories/backupRepository.js')
  const deleteDb = name => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve(true)
    request.onerror = () => reject(request.error || new Error('Failed to clear ' + name))
    request.onblocked = () => reject(new Error('Delete blocked for ' + name))
  })
  const getAll = async storeName => {
    const db = await openCanonicalDB()
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }
  const count = async storeName => (await getAll(storeName)).length
  const put = async (storeName, value) => {
    const db = await openCanonicalDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      tx.objectStore(storeName).put(value)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error || new Error('write failed'))
      tx.onabort = () => reject(tx.error || new Error('write aborted'))
    })
  }
  await deleteDb('kanishka_kfe_canonical_db')
  setActiveDataSource('canonical')

  const first = await FuelRepository.create({
    id: 'phase4-recovery-fuel', clientMutationId: 'phase4-recovery-client',
    odometer: 3000, pricePerKg: 82, amount: 410, quantityKg: 5, isFullTank: true,
  })
  if (first.id !== 'phase4-recovery-fuel') throw new Error('Initial repository write failed.')

  const retry = await FuelRepository.create({
    id: 'phase4-recovery-fuel-retry-id', clientMutationId: 'phase4-recovery-client',
    odometer: 3000, pricePerKg: 82, amount: 410, quantityKg: 5, isFullTank: true,
  })
  if (retry.id !== first.id) throw new Error('Duplicate clientMutationId did not return the original record.')
  if ((await count('fuel_logs')) !== 1) throw new Error('Idempotent retry created a duplicate fuel record.')
  if ((await count('pending_mutations')) !== 1) throw new Error('Idempotent retry created a duplicate mutation.')

  const db = await openCanonicalDB()
  await new Promise(resolve => {
    const tx = db.transaction('fuel_logs', 'readwrite')
    tx.objectStore('fuel_logs').put({
      id: 'phase4-interrupted-fuel', clientMutationId: 'phase4-interrupted',
      odometer: 3010, pricePerKg: 82, amount: 410, quantityKg: 5, isFullTank: true,
      capturedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
    tx.oncomplete = () => { throw new Error('Interrupted transaction unexpectedly committed.') }
    tx.onabort = () => resolve()
    try { tx.abort() } catch (_) { resolve() }
  })
  if ((await getAll('fuel_logs')).some(row => row.id === 'phase4-interrupted-fuel')) {
    throw new Error('Interrupted write left a partial fuel record.')
  }

  await put('pending_mutations', {
    id: 'phase4-stale-mutation', mutationVersion: 1, entityId: first.id, entityType: 'FUEL',
    action: 'CREATE', payload: structuredClone(first), status: 'SYNCING', retryCount: 0,
    createdAt: '2026-09-25T00:00:00.000Z',
  })
  await MutationRepository.recoverStaleSyncing()
  const recovered = (await getAll('pending_mutations')).find(row => row.id === 'phase4-stale-mutation')
  if (!recovered || recovered.status !== 'PENDING') throw new Error('Stale SYNCING mutation did not recover to PENDING.')

  const backupRepo = createBackupRepository(['fuel_logs'])
  const snapshot = await backupRepo.readCanonicalSnapshot()
  await backupRepo.resetCanonicalData()
  if ((await count('fuel_logs')) !== 0) throw new Error('Canonical reset did not clear the fuel state.')
  await backupRepo.restoreCanonicalSnapshot(snapshot)
  const restored = await FuelRepository.getAll()
  if (!restored.some(row => row.id === first.id)) throw new Error('Canonical state reconstruction did not restore the repository record.')

  return { initialId: first.id, retryReturnedId: retry.id, fuelCountAfterRetry: 1,
    pendingMutationCountAfterRetry: 1, interruptedWriteAbsent: true, staleMutationStatus: recovered.status,
    restoredIds: restored.map(row => row.id) }
})
let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const context1 = await browser.newContext({ serviceWorkers: 'block' })
  const page1 = await context1.newPage()
  await page1.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const firstRun = await run(page1)
  await context1.close()
  const context2 = await browser.newContext({ serviceWorkers: 'block' })
  const page2 = await context2.newPage()
  await page2.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const afterRestart = await page2.evaluate(async () => {
    const { setActiveDataSource } = await import('/src/utils/indexedDB.js')
    const { FuelRepository } = await import('/src/repositories/fuelRepository.js')
    setActiveDataSource('canonical')
    return (await FuelRepository.getAll()).map(row => row.id)
  })
  await context2.close()
  if (!afterRestart.includes('phase4-recovery-fuel')) throw new Error('Repository state did not survive browser restart/reload boundary.')
  console.log('PASS Phase 4 Persistence & Recovery:', JSON.stringify({ ...firstRun, survivesBrowserRestart: true, afterRestartIds: afterRestart }))
} catch (error) {
  throw new Error(error.message + '\n' + output)
} finally {
  await browser?.close()
  await stop()
}
