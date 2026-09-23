import assert from 'node:assert/strict'
import fs from 'node:fs'

const main = fs.readFileSync('src/main.js', 'utf8')
const startup = fs.readFileSync('src/application/startup/startupService.js', 'utf8')
const platform = fs.readFileSync('src/infrastructure/startup/platformStartup.js', 'utf8')
const sw = fs.readFileSync('public/service-worker.js', 'utf8')
const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'))
const index = fs.readFileSync('index.html', 'utf8')
const vite = fs.readFileSync('vite.config.js', 'utf8')

assert.equal((main.match(/serviceWorker\.register\s*\(/g) || []).length, 0, 'main.js must not own service-worker registration')
assert.equal((platform.match(/serviceWorker\.register\s*\(/g) || []).length, 1, 'PlatformStartup must own the single registration path')
assert.match(startup, /await platform\.initializeStorage\(\)/, 'storage must be ready before the app is considered initialized')
assert.match(startup, /await MutationRepository\.recoverStaleSyncing\(\)/, 'stale canonical mutations must recover before readiness')
assert.match(startup, /void platform\.registerServiceWorker\(\)/, 'service-worker registration must remain non-blocking')
assert.match(platform, /serviceWorker\.register\('\.\/service-worker\.js', \{ scope: '\.\/' \}\)/)
assert.match(platform, /registration\.update\(\)\.catch/)

assert.match(sw, /const CACHE_NAME = 'kfe-pwa-shell-v5'/, 'service-worker cache version must advance with lifecycle behavior')
assert.match(sw, /cache\.addAll\(SHELL_ASSETS\)/, 'install must cache only guaranteed shell assets')
assert.match(sw, /request\.mode === 'navigate'/, 'offline index fallback must be navigation-only')
assert.doesNotMatch(sw, /caches\.match\('\.\/index\.html'\)\)\s*\/\/ fallback for every GET/, 'index must not be a universal asset fallback')
assert.match(sw, /return new Response\('', \{ status: 504/, 'uncached offline subresources must not receive HTML')
assert.match(sw, /self\.clients\.claim\(\)/)
assert.match(sw, /self\.skipWaiting\(\)/)

assert.equal(manifest.start_url, './')
assert.equal(manifest.scope, './')
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.orientation, 'portrait')
assert.match(index, /<link rel="manifest" href="\.\/manifest\.json"/)
assert.match(index, /BOOT_TIMEOUT_MS = 10000/, 'pre-Vue boot screen must have a finite watchdog')
assert.match(index, /KFE interface did not finish loading within 10 seconds/, 'boot watchdog must expose an actionable failure')
assert.match(main, /if \(!Capacitor\.isNativePlatform\(\)\)/, 'native startup must not install the PWA service-worker reload lifecycle')
assert.match(vite, /base:\s*['"]\.\/['"]/, 'Vite must emit relative assets so Capacitor local WebView can load the bundle')

console.log('Phase 3 startup/PWA lifecycle contract passed')
