import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const base = 'http://127.0.0.1:4173/'
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], {
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

  // A5-support: the fuel control is available while the driver remains OFFLINE.
  await route('', '.cockpit', 'Work')
  const fuelButton = page.getByRole('button', { name: 'CNG refuelling' })
  assert(await fuelButton.count() === 1, 'A5 fuel control is missing')
  assert(await page.getByRole('switch', { name: /go online/i }).count() === 1, 'A5 online/offline control is missing')
  await fuelButton.click()
  assert(await page.getByText('Refuelling', { exact: true }).count() === 1, 'A5 offline fuel form did not open')
  await page.getByRole('button', { name: 'Keep Draft & Close' }).click()

  // D2/F5-support: browser network loss does not destroy the already-loaded PWA shell,
  // and the app recovers once network connectivity is restored.
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Timeline', exact: true }).click()
  await page.locator('.timeline').waitFor({ state: 'attached', timeout: 10000 })
  assert(await page.getByText('TIMELINE', { exact: false }).count() > 0, 'D2 offline navigation did not remain available')
  await context.setOffline(false)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor({ state: 'attached', timeout: 30000 })
  assert(await page.locator('.kfe-runtime-error').count() === 0, 'F5 recovery produced a runtime error')

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

  console.log('PASS Phase 4 operational gap suite: A5 offline fuel access, D2 offline PWA continuity, F5 network recovery, G2 permission denial, G3 GPS unavailable, and G4 permission restoration without duplicate GPS snapshots.')
} catch (error) {
  throw new Error(error.message + '\\n' + output)
} finally {
  await browser?.close()
  await stop()
}
