import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
  detached: true,
})

let output = ''
preview.stdout.on('data', chunk => { output += chunk.toString() })
preview.stderr.on('data', chunk => { output += chunk.toString() })

const waitForPreview = async () => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4173/')
      if (response.ok) return
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Vite preview did not become ready. Output:\n${output}`)
}

const stopPreview = async () => {
  if (!preview.pid) return
  try { process.kill(-preview.pid, 'SIGTERM') } catch (_) {
    try { preview.kill('SIGTERM') } catch (_) {}
  }
  await new Promise(resolve => setTimeout(resolve, 500))
  try { process.kill(-preview.pid, 'SIGKILL') } catch (_) {}
}

const finishSetupIfEnabled = async page => {
  // The setup wizard is intentionally optional. When a launch build enables it,
  // skip it non-destructively so this test can still verify the requested route.
  for (let i = 0; i < 20 && await page.locator('.first-run').count(); i++) {
    const skip = page.getByRole('button', { name: "Skip — I'll fill this later", exact: true })
    if (await skip.count() && await skip.isEnabled()) await skip.click()
    else await page.waitForTimeout(250)
  }
  await page.waitForFunction(() => !document.querySelector('.first-run'), undefined, { timeout: 15000 })
}

const routes = [
  { path: '/', selector: '.work-canonical', label: 'Work' },
  { path: '/timeline', selector: '.timeline', label: 'Timeline' },
  { path: '/performance', selector: '.performance-page', label: 'Performance' },
  { path: '/admin', selector: '.admin-page', label: 'Admin' },
]

let browser = null
try {
  await waitForPreview()
  browser = await chromium.launch({ headless: true })

  // Use an isolated browser context for each direct URL. This prevents service-worker
  // controller changes or state from a previous route from contaminating the next
  // hard-navigation check, while still exercising the actual production bundle.
  for (const route of routes) {
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    const failedRequests = []
    page.on('pageerror', error => errors.push(error.stack || error.message))
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText || 'request failed'
      if (request.resourceType() === 'document' && errorText === 'net::ERR_ABORTED') return
      failedRequests.push(`${request.method()} ${request.url()} — ${errorText}`)
    })

    try {
      const url = `http://127.0.0.1:4173${route.path}`
      const directResponse = await fetch(url)
      if (![200, 404].includes(directResponse.status)) {
        throw new Error(`${route.label}: history route response failed: ${directResponse.status}`)
      }

      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      if (!response || ![200, 404].includes(response.status())) {
        throw new Error(`${route.label}: unexpected document response ${response?.status()}`)
      }

      await finishSetupIfEnabled(page)
      await page.locator('header.top-bar').waitFor({ state: 'visible', timeout: 15000 })
      await page.locator(route.selector).waitFor({ state: 'visible', timeout: 20000 })
      await page.waitForFunction(selector => {
        const node = document.querySelector(selector)
        return !!node && node.children.length > 0 && document.readyState === 'complete'
      }, route.selector, { timeout: 20000 })

      if (!page.url().endsWith(route.path)) {
        throw new Error(`${route.label}: router did not preserve direct history URL ${route.path}: ${page.url()}`)
      }
      if (errors.length) throw new Error(`${route.label}: browser runtime errors:\n${errors.join('\n\n')}`)
      if (failedRequests.length) throw new Error(`${route.label}: failed browser requests:\n${failedRequests.join('\n')}`)

      console.log(`PASS Pages route ${route.path}: HTTP ${response.status()}, visible ${route.label} surface, URL ${page.url()}`)
    } finally {
      await context.close()
    }
  }

  console.log('GitHub Pages runtime smoke passed: each direct route loads in an isolated browser context with the correct visible screen.')
} finally {
  await browser?.close()
  await stopPreview()
}
