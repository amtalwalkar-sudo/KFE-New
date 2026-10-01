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
  try {
    process.kill(-preview.pid, 'SIGTERM')
  } catch (_) {
    try { preview.kill('SIGTERM') } catch (_) {}
  }
  await new Promise(resolve => setTimeout(resolve, 500))
  try {
    process.kill(-preview.pid, 'SIGKILL')
  } catch (_) {}
}

let browser = null
try {
  await waitForPreview()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  const failedRequests = []

  page.on('pageerror', error => errors.push(error.stack || error.message))
  page.on('requestfailed', request => { const errorText=request.failure()?.errorText || 'request failed'; if(request.resourceType()==='document' && errorText==='net::ERR_ABORTED') return; failedRequests.push(`${request.method()} ${request.url()} — ${errorText}`) })

  // Vite preview serves the built site at its local root. The production
  // bundle uses relative assets, so the same artifact remains compatible
  // with the GitHub Pages /KFE-New/ subpath and Capacitor's local origin.
  const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  if (!response?.ok()) throw new Error(`Pages entry response was not successful: ${response?.status()}`)

  await page.locator('header.top-bar').waitFor({ state: 'visible', timeout: 45000 })
  await page.getByText('Kanishka Enterprises', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 })
  await page.getByRole('link', { name: 'Work' }).waitFor({ state: 'visible', timeout: 5000 })

  // Exercise every production history route directly, including hard navigation.
  // GitHub Pages serves 404.html as the SPA shell so these URLs must resolve
  // to the correct Vue route rather than silently falling back to Work.
  const routes = [
    { path: '/timeline', text: 'Timeline' },
    { path: '/performance', text: 'Performance' },
    { path: '/admin', text: 'Admin' },
  ]

  for (const route of routes) {
    const directResponse = await page.goto(`http://127.0.0.1:4173${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    if (!directResponse || ![200, 404].includes(directResponse.status())) throw new Error(`History route response failed for ${route.path}: ${directResponse?.status()}`)
    await page.getByText(route.text, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 })
    if (!page.url().endsWith(route.path)) throw new Error(`Router did not preserve history URL for ${route.path}: ${page.url()}`)
  }

  if (errors.length) throw new Error(`Browser runtime errors:\n${errors.join('\n\n')}`)
  if (failedRequests.length) throw new Error(`Failed browser requests:\n${failedRequests.join('\n')}`)

  console.log('GitHub Pages runtime smoke passed: built PWA loads, Vue mounts, startup completes, and the Work shell renders with relative assets.')
} finally {
  await browser?.close()
  await stopPreview()
}
