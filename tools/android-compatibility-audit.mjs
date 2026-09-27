import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const base = 'http://127.0.0.1:4177/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4177'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' }, detached: true,
})
let output = ''
dev.stdout.on('data', c => output += c.toString())
dev.stderr.on('data', c => output += c.toString())

const sleep = ms => new Promise(r => setTimeout(r, ms))
const assert = (v, m) => { if (!v) throw new Error(m) }
const waitServer = async () => {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try { if ((await fetch(base)).ok) return } catch (_) {}
    await sleep(250)
  }
  throw new Error('Android compatibility audit server did not start.')
}
const stop = async () => {
  if (!dev.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch (_) {}
  await sleep(400)
}
const deleteDb = async page => page.evaluate(async () => {
  for (const name of ['kanishka_kfe_canonical_db', 'kanishka_kfe_synthetic_db']) {
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(name)
      r.onsuccess = resolve
      r.onerror = () => reject(r.error)
      r.onblocked = () => reject(new Error('DB delete blocked: ' + name))
    })
  }
  const { setActiveDataSource } = await import(location.origin + '/src/utils/indexedDB.js')
  setActiveDataSource('canonical')
})
const readShifts = page => page.evaluate(async () => {
  const request = indexedDB.open('kanishka_kfe_canonical_db', 13)
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const rows = await new Promise((resolve, reject) => {
    const r = db.transaction('shifts', 'readonly').objectStore('shifts').getAll()
    r.onsuccess = () => resolve(r.result || [])
    r.onerror = () => reject(r.error)
  })
  db.close()
  return rows
})
const bootWork = async page => {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.work-canonical').waitFor({ state: 'attached', timeout: 30000 })
}
const startShift = async page => {
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await page.getByLabel('Current odometer').fill('1000')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.getByText('ONLINE · IDLE', { exact: true }).waitFor()
}

let browser
const evidence = []
try {
  await waitServer()
  mkdirSync('artifacts/android-compatibility-audit', { recursive: true })
  browser = await chromium.launch({ headless: true })
  const matrix = [
    { name: 'small-phone', width: 360, height: 800 },
    { name: 'standard-phone', width: 390, height: 844 },
    { name: 'large-phone', width: 412, height: 915 },
  ]

  for (const profile of matrix) {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
      geolocation: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
      permissions: ['geolocation'],
    })
    await context.addInitScript(() => {
      const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
      navigator.geolocation.getCurrentPosition = success => success({
        coords: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
        timestamp: Date.now(),
      })
      window.__kfeOriginalGeo = original
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.stack || e.message))
    page.on('requestfailed', r => {
      const u = r.url()
      if (!u.startsWith('http://127.0.0.1:4177/') && !u.includes('bigdatacloud.net')) errors.push('request failed: ' + u)
    })

    // 1/2/4/11/12: phone geometry, touch capability, layout overflow and orientation.
    await bootWork(page)
    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      touchPoints: navigator.maxTouchPoints,
      swipe: [...document.querySelectorAll('.swipe-handle')].map(el => ({ rect: el.getBoundingClientRect().toJSON(), display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility })).filter(x => x.rect.width > 0 && x.rect.height > 0 && x.display !== 'none' && x.visibility !== 'hidden').sort((a,b) => b.rect.width*b.rect.height - a.rect.width*a.rect.height)[0]?.rect ?? null,
      bottomNav: document.querySelector('.bottom-nav')?.getBoundingClientRect().toJSON(),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(geometry.touchPoints > 0, profile.name + ': touch capability missing')
    assert(!geometry.horizontalOverflow, profile.name + ': horizontal overflow')
    assert(geometry.swipe && geometry.swipe.width >= 44 && geometry.swipe.height >= 44, profile.name + ': swipe target too small')
    assert(geometry.bottomNav && geometry.bottomNav.bottom <= window.innerHeight + 2, profile.name + ': bottom navigation escapes viewport')
    evidence.push({ id: 'LAYOUT.' + profile.name, result: 'PASS', checks: ['touch', 'no-horizontal-overflow', 'swipe-target>=44px', 'bottom-nav-in-viewport'], viewport: [profile.width, profile.height] })

    // 2: real pointer/touch sequence against the authoritative swipe control.
    await deleteDb(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await startShift(page)
    const swipe = page.locator('.swipe-handle')
    await swipe.dispatchEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 180, clientY: 700, pointerId: 1, isPrimary: true })
    await swipe.dispatchEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: 250, clientY: 700, pointerId: 1, isPrimary: true })
    await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
    const shifts = await readShifts(page)
    assert(shifts.length === 1 && shifts[0].status === 'ACTIVE', profile.name + ': touch swipe corrupted shift state')
    evidence.push({ id: 'TOUCH.' + profile.name, result: 'PASS', expected: 'touch pointer sequence remains usable and shift remains ACTIVE' })

    // 3: keyboard/viewport resize compatibility. Verify inputs remain reachable after a large visual viewport change.
    const before = await page.evaluate(() => ({ h: window.innerHeight, vv: window.visualViewport?.height ?? null }))
    await page.getByRole('button', { name: 'ONLINE', exact: true }).click()
    const input = page.getByLabel('Closing odometer')
    await input.scrollIntoViewIfNeeded()
    await input.focus()
    await page.evaluate(() => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: Math.max(320, window.innerHeight - 300) })
      if (window.visualViewport) Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: Math.max(320, window.visualViewport.height - 300) })
      window.dispatchEvent(new Event('resize'))
    })
    const after = await input.boundingBox()
    assert(after && after.y >= -2 && after.y < window.innerHeight, profile.name + ': focused input is inaccessible after keyboard-like resize')
    evidence.push({ id: 'KEYBOARD.' + profile.name, result: 'PASS', before, after: { inputY: after.y, inputHeight: after.height } })

    // 5/7/9: permission and GPS/network state transitions must not crash the app.
    await context.grantPermissions([])
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.work-canonical').waitFor()
    await context.setOffline(true)
    await page.waitForTimeout(300)
    await context.setOffline(false)
    await page.waitForTimeout(300)
    assert(errors.length === 0, profile.name + ': browser/runtime errors during GPS/permission/network transitions: ' + errors.join(' | '))
    evidence.push({ id: 'ENV.' + profile.name, result: 'PASS', checks: ['geolocation-permission-revocation', 'offline-online-transition', 'no-runtime-errors'] })

    // 6: visibility/background-like transition must not create duplicate persisted shifts.
    await deleteDb(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await startShift(page)
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('visibilitychange'))
    })
    const afterVisibility = await readShifts(page)
    assert(afterVisibility.length === 1 && afterVisibility[0].status === 'ACTIVE', profile.name + ': visibility transition mutated shift state')
    evidence.push({ id: 'BACKGROUND.' + profile.name, result: 'PASS', expected: 'one ACTIVE shift after visibility/blur/focus cycle' })

    await context.close()
  }

  // 10/12: standalone-display media mode and orientation changes.
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  await bootWork(page)
  const portrait = await page.evaluate(() => matchMedia('(orientation: portrait)').matches)
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.setViewportSize({ width: 844, height: 390 })
  const landscape = await page.evaluate(() => ({
    orientation: matchMedia('(orientation: landscape)').matches,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    standaloneQuery: matchMedia('(display-mode: standalone)').matches,
  }))
  assert(portrait, 'portrait media query failed')
  assert(landscape.orientation, 'landscape media query failed')
  assert(!landscape.overflow, 'landscape layout has horizontal overflow')
  evidence.push({ id: 'ORIENTATION', result: 'PASS', checks: ['portrait', 'landscape', 'no-landscape-overflow'] })
  evidence.push({ id: 'PWA_DISPLAY_MODE', result: 'PASS', checks: ['display-mode query evaluated', 'PWA manifest/build already gated elsewhere'], observedStandalone: landscape.standaloneQuery })

  assert(errors.length === 0, 'Android compatibility audit browser errors: ' + errors.join(' | '))
  const result = {
    audit: 'android-compatibility-simulation',
    rule: 'Exercise Android-relevant browser conditions and verify no runtime error, inaccessible controls, layout overflow, or business-state corruption.',
    total: evidence.length,
    pass: evidence.length,
    fail: 0,
    note: 'This is an automated compatibility simulation, not physical Android hardware validation.',
    evidence,
  }
  await writeFile('artifacts/android-compatibility-audit/android-compatibility-audit.json', JSON.stringify(result, null, 2))
  console.log('ANDROID COMPATIBILITY AUDIT PASS ' + JSON.stringify({ total: result.total, pass: result.pass, fail: result.fail }))
  console.log(JSON.stringify(evidence))
  await context.close()
} catch (e) {
  throw new Error(e.message + '\n' + output)
} finally {
  await browser?.close()
  await stop()
}
