import { chromium } from 'playwright'

const base = String(process.env.KFE_RUNTIME_BASE_URL || '').replace(/\/$/, '')
if (!base) throw new Error('KFE_RUNTIME_BASE_URL is required')

const routes = [
  { path: '/', selector: '.work-canonical', label: 'Work' },
  { path: '/timeline', selector: '.timeline', label: 'Timeline' },
  { path: '/performance', selector: '.performance-page', label: 'Performance' },
  { path: '/admin', selector: '.admin-page', label: 'Admin' },
]

const finishSetupIfEnabled = async page => {
  for (let i = 0; i < 20 && await page.locator('.first-run').count(); i++) {
    const skip = page.getByRole('button', { name: "Skip — I'll fill this later", exact: true })
    if (await skip.count() && await skip.isEnabled()) await skip.click()
    else await page.waitForTimeout(250)
  }
  await page.waitForFunction(() => !document.querySelector('.first-run'), undefined, { timeout: 15000 })
}

const waitForSurface = async (page, route, phase) => {
  try {
    await page.waitForSelector(route.selector, { state: 'visible', timeout: 45000 })
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      bodyText: (document.body?.innerText || '').slice(0, 1800),
      appHtml: (document.querySelector('#app')?.innerHTML || '').slice(0, 2400),
      scripts: [...document.scripts].map(script => script.src).filter(Boolean),
      startupState: document.querySelector('.kfe-startup-status')?.innerText || '',
      runtimeError: document.querySelector('.kfe-runtime-error')?.innerText || '',
    })).catch(e => ({ diagnosticReadError: e.message }))
    throw new Error(`${route.label}: ${phase} did not render ${route.selector}. Original: ${error.message}. Diagnostics: ${JSON.stringify({ ...diagnostics, pageErrors: page.__kfePageErrors, consoleErrors: page.__kfeConsoleErrors, failedRequests: page.__kfeFailedRequests })}`)
  }
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector)
    return !!node && node.children.length > 0 && document.readyState === 'complete'
  }, route.selector, { timeout: 45000 })
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
try {
  for (const route of routes) {
    const page = await browser.newPage()
    page.__kfePageErrors = []
    page.__kfeConsoleErrors = []
    page.__kfeFailedRequests = []
    page.on('pageerror', error => page.__kfePageErrors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') page.__kfeConsoleErrors.push(message.text())
    })
    page.on('requestfailed', request => {
      const errorText = request.failure()?.errorText || 'request failed'
      if (request.resourceType() === 'document' && errorText === 'net::ERR_ABORTED') return
      page.__kfeFailedRequests.push(`${request.method()} ${request.url()} — ${errorText}`)
    })
    const url = route.path === '/' ? `${base}/` : `${base}${route.path}`
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!response || response.status() !== 200) {
      throw new Error(`${route.label}: expected HTTP 200 on initial navigation, got ${response?.status()}`)
    }
    await finishSetupIfEnabled(page)
    await waitForSurface(page, route, 'initial navigation')
    if (page.__kfePageErrors.length) throw new Error(`${route.label}: browser runtime errors before refresh: ${page.__kfePageErrors.join('; ')}`)
    if (page.__kfeFailedRequests.length) throw new Error(`${route.label}: failed browser requests before refresh: ${page.__kfeFailedRequests.join('; ')}`)

    page.__kfePageErrors.length = 0
    page.__kfeConsoleErrors.length = 0
    page.__kfeFailedRequests.length = 0
    const refreshedResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!refreshedResponse || refreshedResponse.status() !== 200) {
      throw new Error(`${route.label}: expected HTTP 200 after hard refresh, got ${refreshedResponse?.status()}`)
    }
    await finishSetupIfEnabled(page)
    await waitForSurface(page, route, 'hard refresh')
    if (page.__kfePageErrors.length) throw new Error(`${route.label}: browser runtime errors after hard refresh: ${page.__kfePageErrors.join('; ')}`)
    if (page.__kfeFailedRequests.length) throw new Error(`${route.label}: failed browser requests after hard refresh: ${page.__kfeFailedRequests.join('; ')}`)
    const allowedUrls = route.path === '/' ? [url] : [url, `${url}/`]
    if (!allowedUrls.includes(page.url())) throw new Error(`${route.label}: unexpected URL after hard refresh; expected ${allowedUrls.join(' or ')}, got ${page.url()}`)
    console.log(`PASS deployed route ${route.path}: initial HTTP ${response.status()}, hard refresh HTTP ${refreshedResponse.status()}, visible ${route.label} surface, URL ${page.url()}`)
    await page.close()
  }
} finally {
  await browser.close()
}
