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
    if (await page.locator('.work-canonical,.kfe-blank-workspace,.kfe-settings-page').count()) return
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

  // Work remains the operational surface; Timeline and Performance intentionally
  // remain blank, and Admin exposes only the canonical Settings workspace.
  await route(page, '', '.work-canonical', 'Work')
  await wait(async () => (await page.locator('body').innerText()).includes('START SHIFT'), 'Work ready')
  if (await page.locator('.kfe-runtime-error').count()) throw new Error('Work runtime error')
  const workText = await page.locator('body').innerText()
  if (!workText.includes('KFE WORK') || !workText.includes('START SHIFT')) throw new Error('Work UI missing required operational controls')
  if (await page.locator('html').evaluate(el => el.scrollWidth > window.innerWidth + 1)) throw new Error('Work has horizontal viewport overflow')

  await route(page, 'timeline', '.kfe-blank-workspace', 'Timeline')
  if (await page.locator('.timeline').count() !== 0) throw new Error('Timeline unexpectedly mounted the retired presentation')
  if (await page.locator('.kfe-blank-workspace').count() !== 1) throw new Error('Timeline blank workspace must be unique')

  await route(page, 'performance', '.kfe-blank-workspace', 'Performance')
  if (await page.locator('.performance-page').count() !== 0) throw new Error('Performance unexpectedly mounted the retired presentation')
  if (await page.locator('header.top-bar').count() !== 0) throw new Error('Performance route unexpectedly displays the shell header')
  if (await page.locator('.kfe-blank-workspace').count() !== 1) throw new Error('Performance blank workspace must be unique')

  await route(page, 'admin', '.kfe-settings-page', 'Admin')
  await wait(async () => (await page.locator('body').innerText()).includes('Backup & restore'), 'Admin Settings ready')
  if (await page.locator('.admin-page').count() !== 0) throw new Error('Admin unexpectedly mounted the retired admin presentation')
  if (await page.locator('html').evaluate(el => el.scrollWidth > window.innerWidth + 1)) throw new Error('Admin has horizontal viewport overflow')

  // Confirm direct-route navigation also preserves the frozen workspace surfaces.
  await page.getByRole('link', { name: 'Timeline', exact: true }).click()
  await page.locator('.kfe-blank-workspace').waitFor({ state: 'visible' })
  if (await page.locator('.timeline').count() !== 0) throw new Error('Timeline navigation mounted retired presentation')
  await page.getByRole('link', { name: 'Performance', exact: true }).click()
  await page.locator('.kfe-blank-workspace').waitFor({ state: 'visible' })
  if (await page.locator('.performance-page').count() !== 0) throw new Error('Performance navigation mounted retired presentation')

  console.log('Calculation matrix rendered UI smoke: PASS')
  console.log(JSON.stringify({ assertions: 14, routes: ['work', 'timeline', 'performance', 'admin'], performanceAndTimeline: 'intentionally blank', admin: 'canonical Settings only' }))
} finally {
  await browser?.close()
  if (preview?.pid) { try { process.kill(-preview.pid, 'SIGTERM') } catch (_) {} }
}
