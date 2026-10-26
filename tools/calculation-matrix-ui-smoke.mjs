import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const externalBase = process.env.KFE_RUNTIME_BASE_URL?.trim()
const base = externalBase || 'http://127.0.0.1:4173/'
const preview = externalBase ? null : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true })
const wait = async (fn, label, timeout = 30000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await fn()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Timed out: ' + label)
}
const route = async (page, path, selector, label) => {
  await page.goto(new URL(path, base.endsWith('/') ? base : base + '/').href, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await ensureFirstRunComplete(page)
  await page.locator(selector).waitFor({ state: 'attached', timeout: 30000 })
  if (await page.locator('.kfe-runtime-error').count()) throw new Error(label + ' mounted a runtime error')
}
const ensureFirstRunComplete = async page => {
  const setup = page.locator('.first-run')
  try { await setup.waitFor({ state: 'visible', timeout: 3000 }) } catch (_) { return }
  const end = Date.now() + 30000
  while (Date.now() < end) {
    if (await page.locator('.work-canonical,.activity-timeline-page,.performance-page,.admin-page').count()) return
    const skip = page.getByRole('button', { name: /Skip — I'll fill this later/ })
    if (await skip.count()) { await skip.click(); await page.waitForTimeout(150); continue }
    await page.waitForTimeout(150)
  }
  throw new Error('First-run setup did not complete within 30s')
}

let browser
try {
  await wait(async () => { try { return (await fetch(base)).ok } catch (_) { return false } }, 'preview server')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 19.076, longitude: 72.8777, accuracy: 20 }, permissions: ['geolocation'] })

  // Work remains the operational surface; Timeline and Performance are read-only reporting,
  // and Admin exposes canonical Settings.
  await route(page, '', '.work-canonical', 'Work')
  await wait(async () => (await page.locator('body').innerText()).includes('START SHIFT'), 'Work ready')
  if (await page.locator('.kfe-runtime-error').count()) throw new Error('Work runtime error')
  const workText = await page.locator('body').innerText()
  if (!workText.includes('KFE WORK') || !workText.includes('START SHIFT')) throw new Error('Work UI missing required operational controls')
  if (await page.locator('html').evaluate(el => el.scrollWidth > window.innerWidth + 1)) throw new Error('Work has horizontal viewport overflow')

  await route(page, 'timeline', '.activity-timeline-page', 'Timeline')
  await wait(async () => (await page.getByText('Average fuel cost/km', { exact: true }).count()) === 1, 'Timeline fuel cost/km summary')
  if (await page.getByText('Total amount refilled', { exact: true }).count() !== 1) throw new Error('Timeline fuel spending summary is missing')
  if (await page.locator('.performance-page').count() !== 0) throw new Error('Timeline mounted retired Performance presentation')
  for (const label of ['Timeline', 'Performance']) if (!(await page.locator('.bottom-nav').getByText(label, { exact: true }).count())) throw new Error('Bottom navigation is missing ' + label)

  await route(page, 'performance', '.performance-page', 'Performance')
  if (await page.locator('.performance-page').count() !== 1) throw new Error('Performance did not mount')
  if (await page.locator('header.top-bar').count() !== 0) throw new Error('Performance route unexpectedly displays the shell header')
  if (await page.locator('.performance-page').count() !== 1) throw new Error('Performance page must be unique')

  await route(page, 'admin', '.kfe-settings-page', 'Admin')
  await wait(async () => (await page.locator('body').innerText()).includes('Backup & restore'), 'Admin Settings ready')
  if (await page.locator('.admin-page').count() !== 0) throw new Error('Admin unexpectedly mounted the retired admin presentation')
  if (await page.locator('html').evaluate(el => el.scrollWidth > window.innerWidth + 1)) throw new Error('Admin has horizontal viewport overflow')

  // Confirm navigation keeps Timeline and Performance live/read-only.
  await page.getByRole('link', { name: 'Timeline', exact: true }).click()
  await page.locator('.activity-timeline-page').waitFor({ state: 'visible' })
  await wait(async () => (await page.getByText('Average fuel cost/km', { exact: true }).count()) === 1, 'Timeline navigation render')
  if (await page.locator('.performance-page').count() !== 0) throw new Error('Timeline navigation mounted retired Performance presentation')
  await page.getByRole('link', { name: 'Performance', exact: true }).click()
  await page.locator('.performance-page').waitFor({ state: 'visible' })
  if (await page.locator('.performance-page').count() !== 1) throw new Error('Performance navigation failed')

  console.log('Calculation matrix rendered UI smoke: PASS')
  console.log(JSON.stringify({ assertions: 16, routes: ['work', 'timeline', 'performance', 'admin'], timeline: 'read-only reporting route', performance: 'read-only dashboard', timelineFuelHeaders: ['Average fuel cost/km', 'Total amount refilled'], bottomNavigation: ['Timeline', 'Performance'], admin: 'canonical Settings only' }))
} finally {
  await browser?.close()
  if (preview?.pid) { try { process.kill(-preview.pid, 'SIGTERM') } catch (_) {} }
}
