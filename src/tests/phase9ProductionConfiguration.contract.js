import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
const sw = readFileSync('public/service-worker.js', 'utf8')
const androidManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const roadmap = readFileSync('KFE_LAUNCH_MASTER_PLAN.md', 'utf8')

assert.equal(pkg.version, '2.0.0')
assert.equal(cap.appId, 'com.kanishka.pwa')
assert.equal(cap.webDir, 'dist')
assert.equal(manifest.start_url, './')
assert.equal(manifest.scope, './')
assert.equal(manifest.display, 'standalone')
assert.ok(manifest.icons?.some(i => i.src === './icon-192.png' && i.sizes === '192x192'))
assert.ok(manifest.icons?.some(i => i.src === './icon-512.png' && i.sizes === '512x512'))
assert.ok(existsSync('icon-192.png'))
assert.ok(existsSync('icon-512.png'))

assert.match(sw, /CACHE_NAME = 'kfe-pwa-shell-v5'/)
assert.match(sw, /kfe-outbox-retry/)
assert.match(sw, /kfe-daily-cloud-backup/)
assert.doesNotMatch(sw, /localhost|127\.0\.0\.1|192\.168\.|10\.0\.2\.2/)

assert.doesNotMatch(androidManifest, /ACCESS_BACKGROUND_LOCATION/)
assert.doesNotMatch(androidManifest, /android:debuggable="true"/)
assert.match(androidManifest, /android:allowBackup="false"/)

const sourceFiles = [
  'src/application/synthetic/syntheticDataService.js',
  'src/application/startup/startupService.js',
  'src/infrastructure/backup/backupConfigAdapter.js',
  'src/infrastructure/sync/cloudSyncService.js'
]
for (const file of sourceFiles) {
  assert.ok(existsSync(file), file + ' must exist')
  const text = readFileSync(file, 'utf8')
  assert.doesNotMatch(text, /password\s*[:=]\s*['"][^'"]{4,}['"]/i)
  assert.doesNotMatch(text, /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i)
}

assert.match(roadmap, /## Phase 9 — Production Configuration Gate/)
assert.match(roadmap, /Verify production URL, timezone, business configuration, databases, PWA manifest\/service worker, Android package\/version, notifications, GPS configuration, and no test\/synthetic leakage\./)

console.log('KFE Phase 9 production configuration gate contract: PASS')
