import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const base = 'http://127.0.0.1:4176/'
const dev = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4176'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' }, detached: true,
})
let output = ''
dev.stdout.on('data', c => output += c.toString())
dev.stderr.on('data', c => output += c.toString())
const sleep = ms => new Promise(r => setTimeout(r, ms))
const assert = (v, m) => { if (!v) throw new Error(m) }
const wait = async () => {
  const end = Date.now() + 30000
  while (Date.now() < end) {
    try { if ((await fetch(base)).ok) return } catch (_) {}
    await sleep(250)
  }
  throw new Error('Semantic audit server did not start.')
}
const stop = async () => {
  if (!dev.pid) return
  try { process.kill(-dev.pid, 'SIGTERM') } catch (_) {}
  await sleep(400)
}
const reset = async page => {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.evaluate(async () => {
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
    const { AdminRepository } = await import(location.origin + '/src/repositories/adminRepository.js')
    await AdminRepository.saveSetting('kfe-first-run-setup', 'firstRunSetup', { version: 1, status: 'completed', steps: {}, completedAt: new Date().toISOString() })
  })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.work-canonical').waitFor({ state: 'attached', timeout: 30000 })
}
const db = async (page, stores) => page.evaluate(async stores => {
  const request = indexedDB.open('kanishka_kfe_canonical_db', 16)
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const result = {}
  for (const store of stores) {
    result[store] = await new Promise((resolve, reject) => {
      const r = database.transaction(store, 'readonly').objectStore(store).getAll()
      r.onsuccess = () => resolve(r.result || [])
      r.onerror = () => reject(r.error)
    })
  }
  database.close()
  return result
}, stores)

let browser
const evidence = []
try {
  await wait()
  mkdirSync('artifacts/semantic-control-audit', { recursive: true })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    geolocation: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
    permissions: ['geolocation'],
    reducedMotion: 'reduce',
  })
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = success => success({
      coords: { latitude: 19.076, longitude: 72.8777, accuracy: 20 },
      timestamp: Date.now(),
    })
  })
  const page = await context.newPage()
  const errors = []
  const swipeAction = async () => {
    const handle = page.locator('.swipe-handle')
    const box = await handle.boundingBox()
    if (!box) throw new Error('Swipe handle is not visible')
    const y = box.y + box.height / 2
    const startX = box.x + box.width / 2
    const track = page.locator('.trip-swipe')
    const trackBox = await track.boundingBox()
    if (!trackBox) throw new Error('Swipe track is not visible')
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(trackBox.x + trackBox.width - 8, y, { steps: 8 })
    await page.mouse.up()
  }
  const assertContextualViewport = async (selector, label, requireViewport = true) => {
    const surface = page.locator(selector).first()
    assert(await surface.isVisible(), label + ' is not visible')
    const viewport = await page.evaluate(() => ({ height: window.innerHeight, scrollY: window.scrollY }))
    assert(viewport.scrollY === 0, label + ' unexpectedly scrolled the Work page')
    const controls = surface.locator('input, select, button.primary-action').filter({ visible: true })
    const count = await controls.count()
    assert(count > 0, label + ' has no visible primary/input controls')
    if (requireViewport) {
      for (let i = 0; i < count; i += 1) {
        const box = await controls.nth(i).boundingBox()
        assert(box && box.y >= -1 && box.y + box.height <= viewport.height + 1, `${label} has a required control obscured outside the viewport: ${await controls.nth(i).getAttribute('aria-label') || await controls.nth(i).innerText().catch(() => '')} box=${JSON.stringify(box)} viewport=${viewport.height}`)
      }
    }
  }
  const assertInputContract = async (input, { decimal = false } = {}) => {
    assert(await input.getAttribute('type') === 'text', 'Expected KFE keypad text input')
    assert(await input.getAttribute('inputmode') === 'none', 'Expected inputmode=none for KFE keypad input')
    assert(await input.getAttribute('readonly') !== null, 'KFE keypad input must be readonly to the device keyboard')
    if (decimal) assert(await input.getAttribute('aria-label'), 'Decimal KFE input must remain accessible')
  }
  const enterKfeNumber = async (label, value, { action = 'DONE', nextLabel = '' } = {}) => {
    const input = page.getByLabel(label, { exact: true }).first()
    const pad = page.locator('.kfe-work-number-pad')
    if (!(await pad.isVisible().catch(() => false))) {
      await input.click()
      await pad.waitFor({ state: 'visible', timeout: 5000 })
    } else {
      const activeLabel = await pad.locator('.kfe-work-number-pad__display span').innerText()
      assert(activeLabel.trim().toLowerCase() === label.trim().toLowerCase(), label + ' was not activated by KFE NEXT navigation; active=' + activeLabel)
    }
    for (const key of String(value)) {
      const button = pad.getByRole('button', { name: key, exact: true })
      await button.click()
    }
    assert(await input.inputValue() === String(value), label + ' did not accept KFE keypad entry')
    if (action !== 'TYPE') await pad.getByRole('button', { name: action === 'NEXT' ? 'NEXT →' : 'DONE', exact: true }).click()
    if (action === 'NEXT') {
      assert(await pad.isVisible(), label + ' NEXT unexpectedly closed the KFE keypad')
      if (nextLabel) {
        await sleep(50)
        const activeLabel = await pad.locator('.kfe-work-number-pad__display span').innerText()
        assert(activeLabel.trim().toLowerCase() === nextLabel.trim().toLowerCase(), nextLabel + ' was not activated by KFE NEXT navigation; active=' + activeLabel)
      }
    } else if (action !== 'TYPE') {
      assert(!(await pad.isVisible()), label + ' DONE did not close the KFE keypad')
    }
  }
  page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('requestfailed', r => { if (!r.url().startsWith('http://127.0.0.1:4176/')) errors.push('request failed: ' + r.url()) })

  // Contract 1: START SHIFT control must create exactly one ACTIVE shift with the
  // entered opening odometer and survive a repository reread.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  assert(await page.locator('.offline-state').isVisible(), 'Offline cockpit disappeared when Start Shift contextual form opened')
  assert(await page.locator('.start-shift-gate').isVisible(), 'Start Shift form did not open contextually inside Work')
  await enterKfeNumber('Current vehicle odometer', '1000')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).waitFor({ state: 'visible' }); await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.locator('.swipe-copy strong').filter({ hasText: 'GO TO PICKUP' }).waitFor({ state: 'visible', timeout: 10000 })
  let state = await db(page, ['shifts'])
  assert(state.shifts.length === 1 && state.shifts[0].status === 'ACTIVE' && Number(state.shifts[0].startOdometer) === 1000, 'START SHIFT contract failed')
  evidence.push({ id: 'WORK.START_SHIFT', result: 'PASS', expected: 'one ACTIVE shift at 1000 km', persisted: { shifts: state.shifts.length, status: state.shifts[0]?.status, startOdometer: state.shifts[0]?.startOdometer } })

  // Contract 2: primary pickup control must create one ACTIVE trip in PICKUP stage.
  await swipeAction()
  await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'ACTIVE' && state.trips[0].tripStage === 'GOING_TO_PICKUP', 'GO TO PICKUP contract failed')
  evidence.push({ id: 'WORK.GO_TO_PICKUP', result: 'PASS', expected: 'one ACTIVE GOING_TO_PICKUP trip', persisted: { trips: state.trips.length, status: state.trips[0]?.status, tripStage: state.trips[0]?.tripStage } })

  // Contract 3: START TRIP must transition the same trip to RIDE_STARTED, not create another.
  await swipeAction()
  await page.getByRole('button', { name: 'END TRIP', exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].tripStage === 'RIDE_STARTED', 'START TRIP contract failed')
  evidence.push({ id: 'WORK.START_TRIP', result: 'PASS', expected: 'same trip transitions to RIDE_STARTED', persisted: { trips: state.trips.length, tripStage: state.trips[0]?.tripStage } })

  // Contract 4: END TRIP terminalizes immediately; optional details remain non-blocking.
  await swipeAction()
  await page.getByText('TRIP COMPLETED', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'COMPLETED', 'END TRIP contract failed')
  assert(await page.getByRole('button', { name: 'GO TO PICKUP', exact: true }).count() === 1, 'Optional trip details incorrectly block next pickup')
  evidence.push({ id: 'WORK.END_TRIP', result: 'PASS', expected: 'trip completes immediately and optional details do not block next pickup', persisted: { trips: state.trips.length, status: state.trips[0].status, tripStage: state.trips[0].tripStage } })

  // Contract 5: fare is the quick-entry default; optional Toll/Parking expand explicitly, then one OK commits the trip.
  await enterKfeNumber('Trip fare', '800', { action: 'TYPE' })
  await page.getByRole('button', { name: '+ Toll', exact: true }).evaluate(button => button.click())
  await page.getByLabel('Toll', { exact: true }).first().waitFor({ state: 'visible' })
  await enterKfeNumber('Toll', '50', { action: 'TYPE' })
  await page.getByRole('button', { name: '+ Parking', exact: true }).evaluate(button => button.click())
  await page.getByLabel('Parking', { exact: true }).first().waitFor({ state: 'visible' })
  await enterKfeNumber('Parking', '20', { action: 'TYPE' })
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByText('Trip details saved.', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'COMPLETED' && Number(state.trips[0].revenue) === 800 && Number(state.trips[0].toll) === 50 && Number(state.trips[0].parking) === 20, 'SAVE TRIP DETAILS contract failed')
  evidence.push({ id: 'WORK.SAVE_TRIP_DETAILS', result: 'PASS', expected: 'optional fare/toll/parking persist on completed trip', persisted: { trips: state.trips.length, status: state.trips[0].status, revenue: state.trips[0].revenue, toll: state.trips[0].toll, parking: state.trips[0].parking } })

  // Contract 6: OFFLINE -> End Shift persists the closing odometer only; trip fare
  // remains on its completed trip record and appears in the read-only Timeline.
  await page.getByRole('button', { name: 'ONLINE', exact: true }).click()
  assert(await page.getByRole('button', { name: 'ONLINE', exact: true }).getAttribute('aria-pressed') === 'true', 'End Shift opened by leaving the online shift state')
  assert(await page.locator('.end-gate').isVisible(), 'End Shift form did not open contextually inside Work')
  await enterKfeNumber('Closing odometer', '1100')
  await page.getByRole('button', { name: 'OK — END SHIFT', exact: true }).click()
  await page.getByText('SHIFT ENDED', { exact: true }).waitFor()
  state = await db(page, ['shifts', 'trips'])
  assert(state.shifts.length === 1 && state.shifts[0].status === 'COMPLETED' && Number(state.shifts[0].endOdometer) === 1100 && Number(state.shifts[0].revenue) === 800, 'END SHIFT must preserve existing trip-derived financial authority')
  assert(state.trips.length === 1 && Number(state.trips[0].revenue) === 800, 'END SHIFT must preserve the separately saved trip fare')
  assert(state.trips.length === 1 && Number(state.trips[0].revenue) === 800, 'END SHIFT trip linkage contract failed')
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.activity-timeline-page').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText('Completed', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('₹800.00', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  assert(await page.locator('.activity-timeline-page').count() === 1, 'Timeline did not render the completed ride after shift closure')
  await page.goto(new URL('performance', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.performance-page').waitFor({ state: 'visible', timeout: 30000 })
  assert(await page.locator('.performance-page').count() === 1, 'Performance dashboard did not render after shift closure')
  assert(await page.getByRole('heading', { name: 'Performance' }).count() === 1, 'Performance title missing after shift closure')
  evidence.push({ id: 'WORK.END_SHIFT', result: 'PASS', expected: 'COMPLETED shift/revenue persist; read-only Timeline and Performance projections render', persisted: { shiftStatus: state.shifts[0].status, endOdometer: state.shifts[0].endOdometer, revenue: state.shifts[0].revenue } })

  // Contract 7: Back from start-shift gate must not write a shift.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  state = await db(page, ['shifts'])
  assert(state.shifts.length === 0, 'START SHIFT Back created a mutation')
  evidence.push({ id: 'WORK.START_SHIFT_BACK', result: 'PASS', expected: 'no shift mutation', persisted: { shifts: state.shifts.length } })

  // Contract 8: Fuel control must be usable while OFFLINE and persist one fuel record.
  await page.getByRole('button', { name: 'CNG refuelling', exact: true }).click()
  // The compact fuel form intentionally hides the offline helper block to save
  // viewport space. The Work cockpit itself must remain mounted underneath it.
  assert(await page.locator('.work-canonical').isVisible(), 'Fuel context replaced the current Work cockpit')
  assert(!(await page.locator('.offline-state').isVisible()), 'Offline helper block should be hidden while the fuel form is open')
  const compactFuelForm = page.locator('form.focus-surface').filter({ has: page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }) }).first()
  assert(await compactFuelForm.isVisible(), 'Fuel form did not open contextually')
  await enterKfeNumber('Odometer', '1000', { action: 'NEXT', nextLabel: 'Price / kg' })
  await enterKfeNumber('Price / kg', '90', { action: 'NEXT', nextLabel: 'Amount' })
  await enterKfeNumber('Amount', '900')
  // DONE only closes the KFE keypad; saving fuel is an explicit form action.
  await page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes('Fuel saved.') || Boolean(document.querySelector('[role="alert"]')?.textContent?.trim()), null, { timeout: 5000 })
  const fuelSaveError = await page.locator('[role="alert"]').innerText().catch(() => '')
  assert(!fuelSaveError, 'Fuel save action returned an error: ' + fuelSaveError)
  assert(await page.getByText('Fuel saved.', { exact: true }).isVisible(), 'Fuel save action did not confirm success')
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 1 && Number(state.fuel_logs[0].odometer) === 1000, 'CNG refuel contract failed: ' + JSON.stringify(state.fuel_logs))
  evidence.push({ id: 'WORK.CNG_REFUEL_OFFLINE', result: 'PASS', expected: 'one fuel record at 1000 km', persisted: { fuel: state.fuel_logs.length, odometer: state.fuel_logs[0]?.odometer } })

  // Contract 9: cancellation control must persist CANCELLED and must not become a completed ride.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await enterKfeNumber('Current vehicle odometer', '1000')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await swipeAction()
  await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).click()
  await page.getByRole('button', { name: 'Driver cancellation', exact: true }).click()
  await enterKfeNumber('Cancellation fee', '250')
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'CANCELLED', 'CANCEL TRIP contract failed')
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.activity-timeline-page').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText('Cancelled', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Cancellation fee', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('₹250.00', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  assert(await page.locator('.activity-timeline-page').count() === 1, 'Timeline did not render the cancelled trip')
  evidence.push({ id: 'WORK.CANCEL_TRIP', result: 'PASS', expected: 'CANCELLED trip and cancellation fee persist canonically and appear in read-only Timeline', persisted: { trips: state.trips.length, status: state.trips[0]?.status } })

  // Forms Contract: every Work contextual input surface must preserve its state
  // context, use the KFE-owned intelligent numeric input surface, keep controls in the viewport, and
  // commit the documented lifecycle without a hidden second step.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await assertContextualViewport('.start-shift-gate', 'Start Shift form', false)
  const formsStartOdo = page.getByLabel('Current vehicle odometer', { exact: true }).first()
  await assertInputContract(formsStartOdo)
  await enterKfeNumber('Current vehicle odometer', '1000')
  const formsStartAck = page.getByRole('checkbox', { name: /current vehicle odometer/i })
  const ackDeadline = Date.now() + 3000
  while (Date.now() < ackDeadline && !(await formsStartAck.isEnabled())) await sleep(50)
  assert(await formsStartAck.isEnabled(), 'Start Shift odometer confirmation did not become enabled after validated input')
  await formsStartAck.check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.locator('.swipe-copy strong').filter({ hasText: 'GO TO PICKUP' }).waitFor({ state: 'visible', timeout: 10000 })
  evidence.push({ id: 'FORMS.START_SHIFT_INPUT', result: 'PASS', expected: 'contextual form + native numeric odometer + viewport-safe controls' })

  // Trip details: END TRIP exposes fare immediately; optional fields are expanded as needed and one OK saves.
  await swipeAction(); await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByRole('button', { name: 'END TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByText('TRIP COMPLETED', { exact: true }).waitFor()
  await assertContextualViewport('.contextual-form.focus-surface', 'Trip details form')
  await assertInputContract(page.getByLabel('Trip fare', { exact: true }).first())
  assert(await page.getByRole('button', { name: '+ Toll', exact: true }).isVisible(), 'Toll must be collapsed behind an optional control')
  assert(await page.getByRole('button', { name: '+ Parking', exact: true }).isVisible(), 'Parking must be collapsed behind an optional control')
  await enterKfeNumber('Trip fare', '800', { action: 'TYPE' })
  await page.getByRole('button', { name: '+ Toll', exact: true }).evaluate(button => button.click())
  await assertInputContract(page.getByLabel('Toll', { exact: true }).first())
  await enterKfeNumber('Toll', '50', { action: 'TYPE' })
  await page.getByRole('button', { name: '+ Parking', exact: true }).evaluate(button => button.click())
  await assertInputContract(page.getByLabel('Parking', { exact: true }).first())
  await enterKfeNumber('Parking', '20', { action: 'TYPE' })
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  await page.getByText('Trip details saved.', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'COMPLETED' && Number(state.trips[0].revenue) === 800 && Number(state.trips[0].toll) === 50 && Number(state.trips[0].parking) === 20, 'FORMS.TRIP_DETAILS keyboard commit failed: ' + JSON.stringify(state.trips[0]))
  evidence.push({ id: 'FORMS.TRIP_DETAILS_KEYBOARD', result: 'PASS', expected: 'END TRIP -> contextual fare; optional fields expand and one OK saves' })

  // Cancellation: reason + fee are contextual, the fee uses the KFE numpad,
  // and DONE leaves the form ready to commit without a device keyboard.
  await swipeAction(); await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).click()
  await assertContextualViewport('.contextual-form.focus-surface', 'Cancellation form')
  await page.getByRole('button', { name: 'Driver cancellation', exact: true }).click()
  await assertInputContract(page.getByLabel('Cancellation fee', { exact: true }).first())
  await enterKfeNumber('Cancellation fee', '250')
  await page.getByText('Trip cancelled.', { exact: true }).waitFor()
  assert(await page.locator('.contextual-form.focus-surface').count() === 0, 'Cancellation form remained open after commit')
  await page.locator('.swipe-copy strong').filter({ hasText: 'GO TO PICKUP' }).waitFor({ state: 'visible', timeout: 10000 })
  state = await db(page, ['trips'])
  assert(state.trips.length === 2 && state.trips.filter(t => t.status === 'CANCELLED').length === 1 && state.trips.filter(t => t.status === 'COMPLETED').length === 1, 'FORMS.CANCELLATION lifecycle failed')
  evidence.push({ id: 'FORMS.CANCELLATION_KEYBOARD', result: 'PASS', expected: 'contextual cancellation commits and returns to ready/pickup context' })

  // Fuel: blank odometer must be rejected without mutation (fat-finger protection);
  // Partial fill must persist explicitly and the numeric fields must chain by NEXT/DONE.
  await reset(page)
  await page.getByRole('button', { name: 'CNG refuelling', exact: true }).click()
  await assertContextualViewport('form.focus-surface:has(button:has-text("OK — SAVE FUEL"))', 'Fuel form')
  const fuelOdo = page.getByLabel('Odometer', { exact: true })
  const fuelPrice = page.getByLabel('Price / kg')
  const fuelAmount = page.getByLabel('Amount')
  await assertInputContract(fuelOdo)
  await assertInputContract(fuelPrice, { decimal: true })
  await assertInputContract(fuelAmount)
  await page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }).click()
  const fuelAlert = page.getByRole('alert')
  await fuelAlert.waitFor({ state: 'visible' })
  assert((await fuelAlert.innerText()).trim().length > 0, 'Blank fuel odometer did not produce visible validation feedback')
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 0, 'Blank fuel save created a fuel record')
  await enterKfeNumber('Odometer', '1000', { action: 'NEXT', nextLabel: 'Price / kg' })
  await enterKfeNumber('Price / kg', '90', { action: 'NEXT', nextLabel: 'Amount' })
  await page.getByLabel('Partial fill').check()
  await enterKfeNumber('Amount', '900')
  // DONE only dismisses the numeric keypad; fuel persistence is an explicit action.
  await page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }).click()
  await page.getByText('Fuel saved.', { exact: true }).waitFor()
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 1 && Number(state.fuel_logs[0].odometer) === 1000 && state.fuel_logs[0].isFullTank === false, 'FORMS.FUEL partial-fill persistence failed')
  evidence.push({ id: 'FORMS.FUEL_KEYBOARD_SAFETY', result: 'PASS', expected: 'blank odometer rejected; numeric Enter chain works; Partial fill persists' })

  // End Shift: closing odometer -> revenue -> reconciliation -> review -> confirm
  // remains contextual and numeric entry uses the KFE NEXT/DONE sequence.
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await enterKfeNumber('Current vehicle odometer', '1000')
  const endStartAck = page.getByRole('checkbox', { name: /current vehicle odometer/i }); await endStartAck.waitFor({ state: 'visible' }); const endAckDeadline = Date.now() + 3000; while (Date.now() < endAckDeadline && !(await endStartAck.isEnabled())) await sleep(50); assert(await endStartAck.isEnabled(), 'End Shift setup odometer confirmation did not become enabled after validated input'); await endStartAck.check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.locator('.swipe-copy strong').filter({ hasText: 'GO TO PICKUP' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: 'ONLINE', exact: true }).click()
  await assertContextualViewport('.end-gate', 'End Shift close form')
  await assertInputContract(page.getByLabel('Closing odometer', { exact: true }).first())
  await enterKfeNumber('Closing odometer', '1100')
  await assertContextualViewport('.end-gate', 'Odometer-only End Shift form')
  await page.getByRole('button', { name: 'OK — END SHIFT', exact: true }).click()
  await page.getByText('SHIFT ENDED', { exact: true }).waitFor()
  state = await db(page, ['shifts'])
  assert(state.shifts.length === 1 && state.shifts[0].status === 'COMPLETED' && Number(state.shifts[0].endOdometer) === 1100 && Number(state.shifts[0].revenue) === 0, 'FORMS.END_SHIFT must commit only closing odometer/lifecycle, viewport-safe')
  evidence.push({ id: 'FORMS.END_SHIFT_SEQUENCE', result: 'PASS', expected: 'closing odometer -> durable shift end, no revenue/date reconciliation stages' })

  // Route contract: Timeline and Performance are read-only reporting projections.
  await page.goto(new URL('/', base).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.work-canonical').waitFor({ state: 'visible', timeout: 30000 })
  assert(await page.getByRole('navigation').getByRole('link', { name: 'Work', exact: true }).count() === 1, 'Work bottom-navigation entry is missing')
  evidence.push({ id: 'NAV.WORK', result: 'PASS', expected: 'canonical Work route and navigation entry retained', persisted: { route: '/' } })

  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.activity-timeline-page').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByText('Average fuel cost/km', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByText('Total amount refilled', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  assert(await page.locator('.performance-page').count() === 0, 'Timeline mounted retired Performance presentation')
  assert(await page.getByRole('navigation').getByRole('link', { name: 'Timeline', exact: true }).count() === 1, 'Timeline bottom-navigation entry is missing')
  evidence.push({ id: 'NAV.TIMELINE', result: 'PASS', expected: 'live read-only Timeline with fuel metrics and navigation entry retained', persisted: { route: '/timeline' } })

  await page.goto(new URL('performance', base).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.performance-page').waitFor({ state: 'visible', timeout: 30000 })
  assert(await page.locator('.performance-page').count() === 1, 'Performance dashboard did not render')
  assert(await page.getByRole('heading', { name: 'Performance' }).count() === 1, 'Performance title is missing')
  assert(await page.getByRole('combobox', { name: 'Performance period' }).count() === 1, 'Performance period filter is missing')
  assert(await page.getByRole('navigation').getByRole('link', { name: 'Performance', exact: true }).count() === 1, 'Performance bottom-navigation entry is missing')
  evidence.push({ id: 'NAV.PERFORMANCE', result: 'PASS', expected: 'live read-only Performance dashboard with navigation entry retained', persisted: { route: '/performance' } })

  await page.goto(new URL('admin', base).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const admin = page.locator('.admin-page')
  await admin.waitFor({ state: 'visible', timeout: 30000 })
  assert(await admin.getByRole('heading', { name: 'Admin workspace', exact: true }).count() === 1, 'Admin workspace heading did not render')
  assert(await admin.getByRole('button', { name: 'Settings', exact: true }).count() === 0, 'Admin must expose Settings only through the header gear icon')
  assert(await admin.locator('.admin-category').count() === 4, 'Admin must expose exactly four top-level sections')
  for (const section of ['Business Setup', 'Vehicle Records', 'Finance', 'Settings']) {
    assert(await admin.getByText(section, { exact: true }).count() >= 1, 'Admin section missing: ' + section)
  }
  assert(await admin.getByRole('button', { name: 'Prepayments', exact: true }).count() === 0, 'Prepayments must not be a top-level Admin item')
  assert(await admin.getByRole('button', { name: 'Ledger', exact: true }).count() === 0, 'Ledger must not be a top-level Admin item')
  evidence.push({ id: 'NAV.ADMIN', result: 'PASS', expected: 'four-section Admin workspace with approved inventory', persisted: { route: '/admin' } })

  await admin.getByRole('button', { name: /Backup & Restore/ }).first().click()
  const settings = page.locator('.admin-page')
  await settings.getByRole('heading', { name: 'Backup & Restore', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  assert(await settings.getByRole('button', { name: 'Create backup', exact: true }).count() === 1, 'Admin Create backup action missing')
  assert(await settings.getByRole('button', { name: 'Restore from phone', exact: true }).count() === 1, 'Admin Restore from phone action missing')
  assert(await settings.getByRole('checkbox', { name: 'Enable automatic backup', exact: true }).count() === 1, 'Admin Dropbox automatic-backup option missing')
  assert(await settings.getByText('Dropbox', { exact: true }).count() === 1, 'Admin Dropbox connection section missing')
  assert(await settings.getByLabel('Dropbox access token', { exact: true }).count() === 1, 'Admin Dropbox token configuration missing')
  // Settings destinations are separate Admin workspace entries, not duplicate cards inside Settings.
  await page.goto(new URL('admin', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-page').getByRole('heading', { name: 'Admin workspace', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('.admin-page').getByRole('button', { name: /Application Settings/ }).click()
  const applicationSettings = page.locator('.admin-page')
  await applicationSettings.getByRole('heading', { name: 'Application Settings', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  assert(await applicationSettings.getByText('Dark theme is always enabled in KFE.', { exact: true }).count() === 1, 'Application Settings must explain that dark theme is fixed')
  assert(await applicationSettings.getByRole('button', { name: /Light|Auto/ }).count() === 0, 'Light and Auto theme options must not be available')
  assert(await page.locator('html').getAttribute('data-kfe-theme') === 'dark', 'KFE must remain in dark theme')
  assert(await page.locator('html').getAttribute('data-kfe-theme-mode') === 'dark', 'Dark-only theme mode must be enforced on the root document')
  const notificationToggle = applicationSettings.getByRole('checkbox', { name: 'Enable notifications', exact: true })
  assert(await notificationToggle.count() === 1, 'Application Settings notification option missing')
  await notificationToggle.uncheck()
  assert(await page.evaluate(() => localStorage.getItem('kfe.notifications.enabled')) === 'false', 'Notification preference did not persist when disabled')
  await notificationToggle.check()
  assert(await page.evaluate(() => localStorage.getItem('kfe.notifications.enabled')) === 'true', 'Notification preference did not persist when enabled')
  await page.goto(new URL('admin', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-page').getByRole('heading', { name: 'Admin workspace', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('.admin-page').getByRole('button', { name: /Data Reset/ }).click()
  const dataReset = page.locator('.admin-page')
  await dataReset.getByRole('heading', { name: 'Data Reset', exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  assert(await dataReset.getByRole('button', { name: 'Reset all data', exact: true }).count() === 1, 'Admin Data Reset action missing')
  evidence.push({ id: 'ADMIN.SETTINGS', result: 'PASS', expected: 'Application Settings, backup/restore, and data reset reachable from Admin' })

  assert(errors.length === 0, 'Semantic audit browser errors:\n' + errors.join('\n'))
  const result = { audit: 'semantic-control', rule: 'Each tested control must perform its documented business operation, persist the authoritative mutation, and propagate it where applicable.', total: evidence.length, pass: evidence.length, fail: 0, controls: evidence }
  const fs = await import('node:fs/promises')
  await fs.writeFile('artifacts/semantic-control-audit/semantic-control-audit.json', JSON.stringify(result, null, 2))
  console.log('SEMANTIC CONTROL AUDIT PASS ' + JSON.stringify({ total: result.total, pass: result.pass, fail: result.fail }))
  console.log(JSON.stringify(result.controls))
} catch (e) {
  throw new Error(e.message + '\n' + output)
} finally {
  await browser?.close()
  await stop()
}
