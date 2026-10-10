import { chromium } from 'playwright'

const base = String(process.env.KFE_RUNTIME_BASE_URL || '').replace(/\/$/, '')
if (!base) throw new Error('KFE_RUNTIME_BASE_URL is required')

const routes = [
  { path: '/', selector: '.work-canonical', label: 'Work' },
  { path: '/timeline', selector: '.timeline', label: 'Timeline' },
  { path: '/performance', selector: '.performance-page', label: 'Performance' },
  { path: '/admin', selector: '.admin-page', label: 'Admin' },
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
try {
  for (const route of routes) {
    const page = await browser.newPage()
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const url = route.path === '/' ? `${base}/` : `${base}${route.path}`
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!response || response.status() !== 200) {
      throw new Error(`${route.label}: expected HTTP 200 on initial navigation, got ${response?.status()}`)
    }
    await page.waitForSelector(route.selector, { state: 'visible', timeout: 45000 })
    await page.waitForFunction(selector => {
      const node = document.querySelector(selector)
      return !!node && node.children.length > 0 && document.readyState === 'complete'
    }, route.selector, { timeout: 45000 })
    if (pageErrors.length) throw new Error(`${route.label}: browser runtime errors before refresh: ${pageErrors.join('; ')}`)

    pageErrors.length = 0
    const refreshedResponse = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
    if (!refreshedResponse || refreshedResponse.status() !== 200) {
      throw new Error(`${route.label}: expected HTTP 200 after hard refresh, got ${refreshedResponse?.status()}`)
    }
    await page.waitForSelector(route.selector, { state: 'visible', timeout: 45000 })
    await page.waitForFunction(selector => {
      const node = document.querySelector(selector)
      return !!node && node.children.length > 0 && document.readyState === 'complete'
    }, route.selector, { timeout: 45000 })
    if (pageErrors.length) throw new Error(`${route.label}: browser runtime errors after hard refresh: ${pageErrors.join('; ')}`)
    const allowedUrls = route.path === '/' ? [url] : [url, `${url}/`]
    if (!allowedUrls.includes(page.url())) throw new Error(`${route.label}: unexpected URL after hard refresh; expected ${allowedUrls.join(' or ')}, got ${page.url()}`)
    console.log(`PASS deployed route ${route.path}: initial HTTP ${response.status()}, hard refresh HTTP ${refreshedResponse.status()}, visible ${route.label} surface, URL ${page.url()}`)
    await page.close()
  }
} finally {
  await browser.close()
}
