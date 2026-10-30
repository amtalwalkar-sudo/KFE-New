import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf8'))
const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'))
const sw = readFileSync('public/service-worker.js', 'utf8')
const androidManifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')
const roadmap = readFileSync('KFE_LAUNCH_MASTER_PLAN.md', 'utf8')

assert.equal(pkg.version, '2.1.0')
assert.equal(cap.appId, 'com.kanishka.pwa')
assert.equal(cap.webDir, 'dist')
assert.equal(manifest.start_url, './')
assert.equal(manifest.scope, './')
assert.equal(manifest.display, 'standalone')
assert.ok(manifest.icons?.some(i => i.src === './icon-192.png' && i.sizes === '192x192'))
assert.ok(manifest.icons?.some(i => i.src === './icon-512.png' && i.sizes === '512x512'))
assert.ok(existsSync('icon-192.png'))
assert.ok(existsSync('icon-512.png'))

assert.match(sw, /CACHE_NAME = 'kfe-pwa-shell-__KFE_BUILD_ID__'/)
assert.match(sw, /kfe-outbox-retry/)
assert.match(sw, /kfe-outbox-retry/)
assert.doesNotMatch(sw, /periodicsync|daily-cloud-backup/)
assert.doesNotMatch(sw, /localhost|127\.0\.0\.1|192\.168\.|10\.0\.2\.2/)

assert.match(androidManifest, /FOREGROUND_SERVICE_LOCATION/)
assert.match(androidManifest, /foregroundServiceType="specialUse\|location"/)
assert.match(androidManifest, /ACCESS_BACKGROUND_LOCATION/)
assert.doesNotMatch(androidManifest, /\.KfeNativeGpsService/)
assert.doesNotMatch(androidManifest, /android:debuggable="true"/)
assert.match(androidManifest, /android:allowBackup="false"/)

const sourceFiles = [
  'src/application/startup/startupService.js',
  'src/application/backup/backupService.js',
  'src/main.js'
]
for (const file of sourceFiles) {
  assert.ok(existsSync(file), file + ' must exist')
  const text = readFileSync(file, 'utf8')
  assert.doesNotMatch(text, /password\s*[:=]\s*['"][^'"]{4,}['"]/i)
  assert.doesNotMatch(text, /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/i)
}

assert.match(roadmap, /## Phase 9 — Production Configuration Gate/)
assert.match(roadmap, /Phase 9 — Production Configuration Gate/)
const main = readFileSync('src/main.js', 'utf8')
const backupPanel = readFileSync('src/components/admin/BackupRestorePanel.vue', 'utf8')
assert.doesNotMatch([sw, main, backupPanel].join('\n'), /periodicsync|navigator\.onLine|registerNetworkCallback|setInterval\(/i)
assert.match(backupPanel, /Create backup/)
assert.match(backupPanel, /Restore from phone/)
console.log('KFE production configuration contract: local backup only; no automatic connectivity or cloud-backup loop.')
