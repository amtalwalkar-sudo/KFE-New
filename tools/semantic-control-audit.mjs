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
  const request = indexedDB.open('kanishka_kfe_canonical_db', 13)
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
        assert(box && box.top >= -1 && box.bottom <= viewport.height + 1, label + ' has a required control obscured outside the viewport')
      }
    }
  }
  const assertInputContract = async (input, { inputmode, enterkeyhint }) => {
    assert(await input.getAttribute('type') === 'number', 'Expected native number input')
    assert(await input.getAttribute('inputmode') === inputmode, 'Expected inputmode=' + inputmode)
    assert(await input.getAttribute('enterkeyhint') === enterkeyhint, 'Expected enterkeyhint=' + enterkeyhint)
  }
  page.on('pageerror', e => errors.push(e.stack || e.message))
  page.on('requestfailed', r => { if (!r.url().startsWith('http://127.0.0.1:4176/')) errors.push('request failed: ' + r.url()) })

  // Contract 1: START SHIFT control must create exactly one ACTIVE shift with the
  // entered opening odometer and survive a repository reread.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  assert(await page.locator('.offline-state').isVisible(), 'Offline cockpit disappeared when Start Shift contextual form opened')
  assert(await page.locator('.start-shift-gate').isVisible(), 'Start Shift form did not open contextually inside Work')
  const startOdo = page.getByRole('spinbutton', { name: 'Current vehicle odometer' }); await startOdo.fill('1000'); await startOdo.press('Tab'); assert(await startOdo.inputValue()==='1000','START SHIFT input did not accept entry')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.getByText('READY FOR NEXT PICKUP', { exact: true }).waitFor()
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

  // Contract 5: optional fare/toll/parking details persist without changing trip lifecycle authority.
  const tripFare = page.getByLabel('Trip fare'); await tripFare.fill('800'); assert(await tripFare.inputValue()==='800','Trip fare did not accept entry')
  await page.getByLabel('Toll').fill('50')
  await page.getByLabel('Parking').fill('20')
  await page.getByRole('button', { name: 'SAVE DETAILS & CONTINUE', exact: true }).click()
  await page.getByText('Trip details saved.', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'COMPLETED' && Number(state.trips[0].revenue) === 800 && Number(state.trips[0].toll) === 50 && Number(state.trips[0].parking) === 20, 'SAVE TRIP DETAILS contract failed')
  evidence.push({ id: 'WORK.SAVE_TRIP_DETAILS', result: 'PASS', expected: 'optional fare/toll/parking persist on completed trip', persisted: { trips: state.trips.length, status: state.trips[0].status, revenue: state.trips[0].revenue, toll: state.trips[0].toll, parking: state.trips[0].parking } })

  // Contract 6: OFFLINE -> End Shift must persist closing odometer and authoritative revenue,
  // then Timeline and Performance must consume the same values.
  await page.getByRole('button', { name: 'ONLINE', exact: true }).click()
  assert(await page.locator('.target-instrument').isVisible(), 'Target context disappeared when End Shift opened')
  assert(await page.locator('.operational-state').isVisible(), 'Operational context disappeared when End Shift opened')
  assert(await page.locator('.end-gate').isVisible(), 'End Shift form did not open contextually inside Work')
  await page.getByLabel('Closing odometer').fill('1100')
  await page.getByLabel('Total shift revenue').fill('800')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await page.getByRole('button', { name: 'REVIEW COMPLETE', exact: true }).click()
  await page.getByRole('button', { name: 'OK — END SHIFT', exact: true }).click()
  await page.getByText('SHIFT ENDED', { exact: true }).waitFor()
  state = await db(page, ['shifts', 'trips'])
  assert(state.shifts.length === 1 && state.shifts[0].status === 'COMPLETED' && Number(state.shifts[0].endOdometer) === 1100 && Number(state.shifts[0].revenue) === 800, 'END SHIFT persistence contract failed')
  assert(state.trips.length === 1 && Number(state.trips[0].revenue) === 800, 'END SHIFT trip linkage contract failed')
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor()
  await page.getByText('₹800', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 })
  const timelineText = await page.locator('.timeline').innerText()
  assert(timelineText.includes('₹800'), 'Timeline did not propagate authoritative revenue')
  await page.goto(new URL('performance', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.performance-page').waitFor()
  await page.getByText('₹800', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 })
  const performanceText = await page.locator('.performance-page').innerText()
  assert(performanceText.includes('₹800'), 'Performance did not propagate authoritative revenue')
  evidence.push({ id: 'WORK.END_SHIFT', result: 'PASS', expected: 'COMPLETED shift 1000→1100, revenue 800; Timeline and Performance show 800', persisted: { shiftStatus: state.shifts[0].status, endOdometer: state.shifts[0].endOdometer, revenue: state.shifts[0].revenue, timelineRevenue: '₹800', performanceRevenue: '₹800' } })

  // Contract 7: Back from start-shift gate must not write a shift.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  state = await db(page, ['shifts'])
  assert(state.shifts.length === 0, 'START SHIFT Back created a mutation')
  evidence.push({ id: 'WORK.START_SHIFT_BACK', result: 'PASS', expected: 'no shift mutation', persisted: { shifts: state.shifts.length } })

  // Contract 8: Fuel control must be usable while OFFLINE and persist one fuel record.
  await page.getByRole('button', { name: 'CNG refuelling', exact: true }).click()
  assert(await page.locator('.offline-state').isVisible(), 'Fuel context replaced the current Work context')
  assert(await page.locator('.focus-surface').filter({ hasText: 'CNG REFUEL' }).isVisible(), 'Fuel form did not open contextually')
  await page.getByLabel('Odometer').fill('1000')
  await page.getByLabel('Price / kg').fill('90')
  await page.getByLabel('Amount').fill('900')
  await page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }).click()
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 1 && Number(state.fuel_logs[0].odometer) === 1000, 'CNG refuel contract failed')
  evidence.push({ id: 'WORK.CNG_REFUEL_OFFLINE', result: 'PASS', expected: 'one fuel record at 1000 km', persisted: { fuel: state.fuel_logs.length, odometer: state.fuel_logs[0]?.odometer } })

  // Contract 9: cancellation control must persist CANCELLED and must not become a completed ride.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  const cancelStartOdo = page.getByRole('spinbutton', { name: 'Current vehicle odometer' })
  await cancelStartOdo.click()
  await cancelStartOdo.fill('')
  await cancelStartOdo.pressSequentially('1000')
  await cancelStartOdo.press('Tab')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await swipeAction()
  await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).click()
  await page.getByRole('button', { name: 'Driver cancellation', exact: true }).click()
  await page.getByLabel('Cancellation fee').fill('250')
  await page.getByRole('button', { name: 'OK — CONFIRM CANCELLATION', exact: true }).click()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'CANCELLED', 'CANCEL TRIP contract failed')
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor()
  const cancelledTimeline = await page.locator('.timeline').innerText()
  assert(!cancelledTimeline.includes('1 ride'), 'Cancelled trip incorrectly counted as a completed ride')
  evidence.push({ id: 'WORK.CANCEL_TRIP', result: 'PASS', expected: 'CANCELLED trip excluded from completed ride count', persisted: { trips: state.trips.length, status: state.trips[0]?.status } })

  // Forms Contract: every Work contextual input surface must preserve its state
  // context, use native mobile input semantics, keep controls in the viewport, and
  // commit the documented lifecycle without a hidden second step.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  await assertContextualViewport('.start-shift-gate', 'Start Shift form', false)
  const formsStartOdo = page.getByRole('spinbutton', { name: 'Current vehicle odometer' })
  await assertInputContract(formsStartOdo, { inputmode: 'numeric', enterkeyhint: 'done' })
  await formsStartOdo.click()
  await formsStartOdo.fill('')
  await formsStartOdo.pressSequentially('1000')
  await formsStartOdo.press('Tab')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.getByText('READY FOR NEXT PICKUP', { exact: true }).waitFor()
  evidence.push({ id: 'FORMS.START_SHIFT_INPUT', result: 'PASS', expected: 'contextual form + native numeric odometer + viewport-safe controls' })

  // Trip details: END TRIP must expose the fare surface immediately, and Enter must
  // advance fare -> toll -> parking -> save rather than requiring extra taps.
  await swipeAction(); await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByRole('button', { name: 'END TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByText('TRIP COMPLETED', { exact: true }).waitFor()
  await assertContextualViewport('.contextual-form.focus-surface', 'Trip details form')
  const fareInput = page.getByLabel('Trip fare')
  const tripTollInput = page.getByLabel('Toll')
  const tripParkingInput = page.getByLabel('Parking')
  await assertInputContract(fareInput, { inputmode: 'numeric', enterkeyhint: 'next' })
  await assertInputContract(tripTollInput, { inputmode: 'numeric', enterkeyhint: 'next' })
  await assertInputContract(tripParkingInput, { inputmode: 'numeric', enterkeyhint: 'done' })
  await fareInput.fill('800'); await fareInput.press('Enter')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Toll', 'Fare Enter did not advance to Toll')
  await tripTollInput.fill('50'); await tripTollInput.press('Enter')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Parking', 'Toll Enter did not advance to Parking')
  await tripParkingInput.fill('20'); await tripParkingInput.press('Enter')
  await page.getByText('Trip details saved.', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && state.trips[0].status === 'COMPLETED' && Number(state.trips[0].revenue) === 800 && Number(state.trips[0].toll) === 50 && Number(state.trips[0].parking) === 20, 'FORMS.TRIP_DETAILS keyboard commit failed')
  evidence.push({ id: 'FORMS.TRIP_DETAILS_KEYBOARD', result: 'PASS', expected: 'END TRIP -> contextual fare; Enter advances all fields and final Enter saves' })

  // Cancellation: reason + fee are contextual, fee uses the native numeric keyboard,
  // and final Enter commits then returns to the ready/pickup cockpit with no stale form.
  await swipeAction(); await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await page.getByRole('button', { name: 'CANCEL TRIP', exact: true }).click()
  await assertContextualViewport('.contextual-form.focus-surface', 'Cancellation form')
  await page.getByRole('button', { name: 'Driver cancellation', exact: true }).click()
  const cancelFee = page.getByLabel('Cancellation fee')
  await assertInputContract(cancelFee, { inputmode: 'numeric', enterkeyhint: 'done' })
  await cancelFee.fill('250'); await cancelFee.press('Enter')
  await page.getByText('Trip cancelled.', { exact: true }).waitFor()
  assert(await page.locator('.contextual-form.focus-surface').count() === 0, 'Cancellation form remained open after commit')
  await page.getByText('READY FOR NEXT PICKUP', { exact: true }).waitFor()
  state = await db(page, ['trips'])
  assert(state.trips.length === 2 && state.trips.filter(t => t.status === 'CANCELLED').length === 1 && state.trips.filter(t => t.status === 'COMPLETED').length === 1, 'FORMS.CANCELLATION lifecycle failed')
  evidence.push({ id: 'FORMS.CANCELLATION_KEYBOARD', result: 'PASS', expected: 'contextual cancellation commits and returns to ready/pickup context' })

  // Fuel: blank odometer must be rejected without mutation (fat-finger protection);
  // Partial fill must persist explicitly and the numeric fields must chain by Enter.
  await reset(page)
  await page.getByRole('button', { name: 'CNG refuelling', exact: true }).click()
  await assertContextualViewport('.contextual-form.focus-surface', 'Fuel form')
  const fuelOdo = page.getByLabel('Odometer')
  const fuelPrice = page.getByLabel('Price / kg')
  const fuelAmount = page.getByLabel('Amount')
  await assertInputContract(fuelOdo, { inputmode: 'numeric', enterkeyhint: 'next' })
  await assertInputContract(fuelPrice, { inputmode: 'decimal', enterkeyhint: 'next' })
  await assertInputContract(fuelAmount, { inputmode: 'numeric', enterkeyhint: 'done' })
  await page.getByRole('button', { name: 'OK — SAVE FUEL', exact: true }).click()
  assert(await page.getByRole('alert').innerText() === 'ODOMETER_REQUIRED', 'Blank fuel odometer was not rejected safely')
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 0, 'Blank fuel save created a fuel record')
  await fuelOdo.fill('1000'); await fuelOdo.press('Enter')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Price / kg', 'Fuel odometer Enter did not advance')
  await fuelPrice.fill('90'); await fuelPrice.press('Enter')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Amount', 'Fuel price Enter did not advance')
  await fuelAmount.fill('900'); await page.getByLabel('Partial fill').check(); await fuelAmount.press('Enter')
  await page.getByText('Fuel saved.', { exact: true }).waitFor()
  state = await db(page, ['fuel_logs'])
  assert(state.fuel_logs.length === 1 && Number(state.fuel_logs[0].odometer) === 1000 && state.fuel_logs[0].isFullTank === false, 'FORMS.FUEL partial-fill persistence failed')
  evidence.push({ id: 'FORMS.FUEL_KEYBOARD_SAFETY', result: 'PASS', expected: 'blank odometer rejected; numeric Enter chain works; Partial fill persists' })

  // End Shift: closing odometer -> revenue -> reconciliation -> review -> confirm
  // remains contextual and each stage is reachable without page scrolling.
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  const endStartOdo = page.getByRole('spinbutton', { name: 'Current vehicle odometer' })
  await endStartOdo.click(); await endStartOdo.pressSequentially('1000'); await endStartOdo.press('Tab')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await page.getByText('READY FOR NEXT PICKUP', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'ONLINE', exact: true }).click()
  await assertContextualViewport('.end-gate', 'End Shift close form')
  const closingInput = page.getByLabel('Closing odometer')
  const shiftRevenueInput = page.getByLabel('Total shift revenue')
  await assertInputContract(closingInput, { inputmode: 'numeric', enterkeyhint: 'next' })
  await assertInputContract(shiftRevenueInput, { inputmode: 'numeric', enterkeyhint: 'done' })
  await closingInput.fill('1100'); await closingInput.press('Enter')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Total shift revenue', 'Closing odometer Enter did not advance to shift revenue')
  await shiftRevenueInput.fill('900'); await shiftRevenueInput.press('Enter')
  await page.getByText('Reconciliation', { exact: true }).waitFor()
  await assertContextualViewport('.end-gate', 'End Shift reconciliation form')
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click()
  await page.getByText('Shift review', { exact: true }).waitFor()
  await assertContextualViewport('.end-gate', 'End Shift review form')
  await page.getByRole('button', { name: 'REVIEW COMPLETE', exact: true }).click()
  await page.getByText('Ready to end', { exact: true }).waitFor()
  await assertContextualViewport('.end-gate', 'End Shift confirmation form')
  await page.getByRole('button', { name: 'OK — END SHIFT', exact: true }).click()
  await page.getByText('SHIFT ENDED', { exact: true }).waitFor()
  state = await db(page, ['shifts'])
  assert(state.shifts.length === 1 && state.shifts[0].status === 'COMPLETED' && Number(state.shifts[0].endOdometer) === 1100 && Number(state.shifts[0].revenue) === 900, 'FORMS.END_SHIFT sequence failed')
  evidence.push({ id: 'FORMS.END_SHIFT_SEQUENCE', result: 'PASS', expected: 'close -> reconciliation -> review -> confirm -> ended, viewport-safe' })

  // Route controls: navigation must land on the requested module and render it.
  for (const [label, path, selector] of [['NAV.WORK','/','.work-canonical'],['NAV.TIMELINE','/timeline','.timeline'],['NAV.PERFORMANCE','/performance','.performance-page'],['NAV.ADMIN','/admin','.admin-page']]) {
    await page.goto(new URL(path, base).href, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator(selector).waitFor({ state: 'attached', timeout: 30000 })
    evidence.push({ id: label, result: 'PASS', expected: 'route renders requested module', persisted: { route: path } })
  }


  // Contract 14: Timeline period controls must change the authoritative viewing range
  // without mutating business records.
  await reset(page)
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor()
  const timelineDbBefore = await db(page, ['shifts','trips','fuel_logs'])
  for (const [label, expected] of [['Day','day'],['Personal','personal'],['Week','week'],['Month','month']]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.locator('.slider button.active').filter({ hasText: label }).waitFor()
    const periodState = await page.locator('.slider button.active').innerText()
    assert(periodState === label, `TIMELINE.${label} period control did not activate`)
  }
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  assert((await page.locator('.slider button.active').innerText()) === 'Day', 'TIMELINE.TODAY did not return to Day view')
  const timelineDbAfter = await db(page, ['shifts','trips','fuel_logs'])
  assert(JSON.stringify(timelineDbBefore) === JSON.stringify(timelineDbAfter), 'Timeline view controls mutated business records')
  evidence.push({ id: 'TIMELINE.PERIOD_CONTROLS', result: 'PASS', expected: 'Day/Personal/Week/Month/Today change view only; no business mutation' })

  // Contract 15: Timeline previous/next controls must move the displayed period.
  const beforeMove = await page.locator('.period strong').innerText()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('.period strong').waitFor()
  const afterMove = await page.locator('.period strong').innerText()
  assert(afterMove !== beforeMove, 'TIMELINE.NEXT did not move the period')
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  const restoredMove = await page.locator('.period strong').innerText()
  assert(restoredMove === beforeMove, 'TIMELINE.PREVIOUS did not restore the prior period')
  evidence.push({ id: 'TIMELINE.PERIOD_NAVIGATION', result: 'PASS', expected: 'Next advances and Previous reverses the displayed period' })

  // Contract 16: Timeline trip quick-edit must persist the authoritative trip edit.
  await reset(page)
  await page.getByRole('button', { name: 'START SHIFT', exact: true }).click()
  const timelineStartOdo = page.getByRole('spinbutton', { name: 'Current vehicle odometer' })
  await timelineStartOdo.click()
  await timelineStartOdo.fill('')
  await timelineStartOdo.pressSequentially('1000')
  await timelineStartOdo.press('Tab')
  await page.getByRole('checkbox', { name: /current vehicle odometer/i }).check()
  await page.getByRole('button', { name: 'CONFIRM & GO ONLINE', exact: true }).click()
  await swipeAction(); await page.getByRole('button', { name: 'START TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByRole('button', { name: 'END TRIP', exact: true }).waitFor()
  await swipeAction(); await page.getByText('TRIP COMPLETED', { exact: true }).waitFor()
  await page.getByLabel('Trip fare').fill('800')
  await page.getByRole('button', { name: 'SAVE DETAILS & CONTINUE', exact: true }).click()
  await page.getByText('Trip details saved.', { exact: true }).waitFor()
  await page.goto(new URL('timeline', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.timeline').waitFor()
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click()
  const editorFare = page.getByRole('textbox', { name: 'Fare (₹)' })
  await editorFare.click()
  await page.getByRole('button', { name: 'C', exact: true }).click()
  await page.getByRole('button', { name: '9', exact: true }).click()
  await page.getByRole('button', { name: '0', exact: true }).click()
  await page.getByRole('button', { name: '0', exact: true }).click()
  await page.getByRole('button', { name: 'DONE', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  state = await db(page, ['trips'])
  assert(state.trips.length === 1 && Number(state.trips[0].revenue) === 900, 'TIMELINE.EDIT_TRIP did not persist fare 900')
  evidence.push({ id: 'TIMELINE.EDIT_TRIP', result: 'PASS', expected: 'edited completed trip revenue persists as 900' })

  // Contract 18: Performance period controls must update the selected period without
  // mutating business data.
  await reset(page)
  await page.goto(new URL('performance', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.performance-page').waitFor()
  const performanceDbBefore = await db(page, ['shifts','trips','fuel_logs'])
  for (const label of ['DAY','WEEK','MONTH']) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.locator('.pp-period button.active').filter({ hasText: label }).waitFor()
  }
  const performanceBeforeNav = await page.locator('.pp-period-nav span').innerText()
  await page.getByRole('button', { name: 'Previous period', exact: true }).click()
  const performanceAfterNav = await page.locator('.pp-period-nav span').innerText()
  assert(performanceAfterNav !== performanceBeforeNav, 'PERFORMANCE.PREVIOUS did not move period')
  await page.getByRole('button', { name: 'Next period', exact: true }).click()
  assert((await page.locator('.pp-period-nav span').innerText()) === performanceBeforeNav, 'PERFORMANCE.NEXT did not restore period')
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await page.locator('.pp-period button.active').filter({ hasText: 'DAY' }).waitFor()
  const performanceDbAfter = await db(page, ['shifts','trips','fuel_logs'])
  assert(JSON.stringify(performanceDbBefore) === JSON.stringify(performanceDbAfter), 'Performance view controls mutated business records')
  evidence.push({ id: 'PERFORMANCE.PERIOD_CONTROLS', result: 'PASS', expected: 'Day/Week/Month/Today/previous/next change view only' })

  // Contract 19: Admin settings controls must persist the selected theme mode and
  // expose every master/settings navigation target.
  await reset(page)
  await page.goto(new URL('admin', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-page').waitFor()
  await page.locator('.settings-icon-button').click()
  await page.locator('.settings-screen').waitFor({ state: 'visible' })
  await page.locator('.settings-item').filter({ hasText: 'Application Settings' }).click()
  const settingsText = await page.locator('.admin-page').innerText()
  assert(settingsText.includes('Application Settings'), 'ADMIN application settings did not render')
  const dark = page.getByRole('button', { name: /Dark/, exact: true })
  const light = page.getByRole('button', { name: /Light/, exact: true })
  const auto = page.getByRole('button', { name: /Auto/, exact: true })
  assert(await dark.count() + await light.count() + await auto.count() > 0, 'ADMIN theme controls did not render')
  await (await dark.count() ? dark : light).click()
  const themeAfterFirst = await page.evaluate(() => localStorage.getItem('kfe.visual.theme.mode'))
  assert(['dark','light','auto'].includes(themeAfterFirst), 'ADMIN theme selection did not persist')
  if (await light.count()) { await light.click(); assert(await page.evaluate(() => localStorage.getItem('kfe.visual.theme.mode')) === 'light', 'ADMIN.THEME_LIGHT did not persist') }
  if (await auto.count()) { await auto.click(); assert(await page.evaluate(() => localStorage.getItem('kfe.visual.theme.mode')) === 'auto', 'ADMIN.THEME_AUTO did not persist') }
  await page.goto(new URL('admin', base).href, { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-page').waitFor()
  const adminItems = ['Vehicle','Driver','Compliance','Maintenance','Loan','Prepayments','Ledger','Driver Monthly Target','Maintenance per KM']
  for (const item of adminItems) {
    const adminControl = page.locator('.admin-item').filter({ hasText: item }).first()
    await adminControl.waitFor({ state: 'visible', timeout: 30000 })
    await adminControl.click()
    assert((await page.locator('.admin-page').innerText()).includes(item), 'ADMIN navigation did not open ' + item)
    const back = page.getByRole('button', { name: '‹ Back', exact: true })
    if (await back.count()) await back.click()
  }
  evidence.push({ id: 'ADMIN.SETTINGS_NAVIGATION', result: 'PASS', expected: 'theme modes persist and all Admin master targets open' })

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
