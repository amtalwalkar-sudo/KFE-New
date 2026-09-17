import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'

const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
})

let output = ''
preview.stdout.on('data', chunk => { output += chunk.toString() })
preview.stderr.on('data', chunk => { output += chunk.toString() })

const waitForPreview = async () => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:4173/KFE-New/')
      if (response.ok) return
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Vite preview did not become ready. Output:\n${output}`)
}

let browser = null
try {
  await waitForPreview()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  const failedRequests = []

  page.on('pageerror', error => errors.push(error.stack || error.message))
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'request failed'}`))

  const response = await page.goto('http://127.0.0.1:4173/KFE-New/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  if (!response?.ok()) throw new Error(`Pages entry response was not successful: ${response?.status()}`)

  await page.locator('header.top-bar').waitFor({ state: 'visible', timeout: 15000 })
  await page.getByText('Kanishka Enterprises', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 })
  await page.getByRole('link', { name: 'Work' }).waitFor({ state: 'visible', timeout: 5000 })

  if (errors.length) throw new Error(`Browser runtime errors:\n${errors.join('\n\n')}`)
  if (failedRequests.length) throw new Error(`Failed browser requests:\n${failedRequests.join('\n')}`)

  console.log('GitHub Pages runtime smoke passed: built PWA loads, Vue mounts, startup completes, and the Work shell renders.')
} finally {
  await browser?.close()
  preview.kill('SIGTERM')
}
