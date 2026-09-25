import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4174/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4174'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
  detached: true,
})
let output = ''
dev.stdout.on('data', chunk => { output += chunk.toString() })
dev.stderr.on('data', chunk => { output += chunk.toString() })

const waitForServer = async () => {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try {
      if ((await fetch(base)).ok) return
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Synthetic isolation dev server did not start.\\n' + output)
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
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const result = await page.evaluate(async () => {
    const { setActiveDataSource, getActiveDataSource, initializeSyntheticStorage, openCanonicalDB } =
      await import('/src/utils/indexedDB.js')
    const { FuelRepository } = await import('/src/repositories/fuelRepository.js')
    const { MutationRepository } = await import('/src/repositories/mutationRepository.js')

    const dbNames = ['kanishka_kfe_canonical_db', 'kanishka_kfe_synthetic_db']
    const deleteDb = name => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error || new Error('Failed to clear ' + name))
      request.onblocked = () => reject(new Error('Delete blocked for ' + name))
    })
    const count = async (dbPromise, storeName) => {
      const db = await dbPromise
      return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    const ids = async (dbPromise, storeName) => {
      const db = await dbPromise
      return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        request.onsuccess = () => resolve((request.result || []).map(row => row.id))
        request.onerror = () => reject(request.error)
      })
    }

    for (const name of dbNames) await deleteDb(name)

    setActiveDataSource('canonical')
    const canonicalId = 'phase4-canonical-fuel'
    await FuelRepository.create({
      id: canonicalId,
      clientMutationId: 'phase4-canonical-mutation',
      odometer: 1000,
      pricePerKg: 82,
      amount: 410,
      quantityKg: 5,
      isFullTank: true,
    })
    const canonicalPendingBefore = await count(openCanonicalDB(), 'pending_mutations')
    if (canonicalPendingBefore !== 1) throw new Error('Canonical repository write did not create exactly one pending mutation.')

    setActiveDataSource('synthetic')
    if (getActiveDataSource() !== 'synthetic') throw new Error('Synthetic mode did not activate.')
    await FuelRepository.create({
      id: 'phase4-synthetic-fuel',
      clientMutationId: 'phase4-synthetic-mutation',
      odometer: 2000,
      pricePerKg: 82,
      amount: 410,
      quantityKg: 5,
      isFullTank: true,
    })

    const syntheticFuelIds = await ids(initializeSyntheticStorage(), 'fuel_logs')
    const canonicalFuelIds = await ids(openCanonicalDB(), 'fuel_logs')
    if (!syntheticFuelIds.includes('phase4-synthetic-fuel')) throw new Error('Synthetic repository write did not land in synthetic DB.')
    if (canonicalFuelIds.includes('phase4-synthetic-fuel')) throw new Error('Synthetic repository write leaked into canonical DB.')

    const syntheticPending = await count(initializeSyntheticStorage(), 'pending_mutations')
    const syntheticAudit = await count(initializeSyntheticStorage(), 'audit_history')
    const canonicalPendingAfter = await count(openCanonicalDB(), 'pending_mutations')
    if (syntheticPending !== 0 || syntheticAudit !== 0) throw new Error('Synthetic write created mutation/audit records in synthetic DB.')
    if (canonicalPendingAfter !== canonicalPendingBefore) throw new Error('Synthetic write changed canonical pending mutations.')

    const pendingFromSyntheticMode = await MutationRepository.getPending()
    if (pendingFromSyntheticMode.length !== canonicalPendingBefore) throw new Error('MutationRepository did not read the canonical queue in synthetic mode.')

    setActiveDataSource('canonical')
    const canonicalReads = await FuelRepository.getAll()
    if (!canonicalReads.some(row => row.id === canonicalId)) throw new Error('Canonical mode cannot read canonical fuel record.')
    if (canonicalReads.some(row => row.id === 'phase4-synthetic-fuel')) throw new Error('Canonical mode can read synthetic fuel record.')

    setActiveDataSource('synthetic')
    const syntheticReads = await FuelRepository.getAll()
    if (!syntheticReads.some(row => row.id === 'phase4-synthetic-fuel')) throw new Error('Synthetic mode cannot read synthetic fuel record.')
    if (syntheticReads.some(row => row.id === canonicalId)) throw new Error('Synthetic mode can read canonical fuel record.')

    return {
      canonicalPendingBefore,
      canonicalPendingAfter,
      syntheticPending,
      syntheticAudit,
      canonicalFuelIds,
      syntheticFuelIds,
      canonicalReadIds: canonicalReads.map(row => row.id),
      syntheticReadIds: syntheticReads.map(row => row.id),
    }
  })

  console.log('PASS Phase 4 synthetic ↔ canonical repository isolation:', JSON.stringify(result))
} catch (error) {
  throw new Error(error.message + '\\n' + output)
} finally {
  await browser?.close()
  await stop()
}
