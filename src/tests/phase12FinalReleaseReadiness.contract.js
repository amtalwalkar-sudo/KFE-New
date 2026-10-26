import assert from 'node:assert/strict'
import fs from 'node:fs'

const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const css = fs.readFileSync('src/styles/kfe-ui.css', 'utf8')
const app = fs.readFileSync('src/main.js', 'utf8')

assert.doesNotMatch(shell, /header-gps|gpsStatusService|checkGps|gpsState/)
assert.doesNotMatch(app, /navigator\.geolocation|requestBrowserLocation|browserLocationPermission/)
assert.match(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /ACCESS_FINE_LOCATION/)
assert.match(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /ACCESS_COARSE_LOCATION/)
assert.match(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /FOREGROUND_SERVICE_LOCATION/)
assert.match(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /foregroundServiceType="specialUse\|location"/)
assert.match(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'), /ACCESS_BACKGROUND_LOCATION/)
assert.match(fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8'), /hasBackgroundLocationPermission/)
assert.match(css, /:focus-visible/)
assert.match(css, /prefers-reduced-motion:reduce/)
assert.match(css, /safe-area-inset-bottom/)
assert.match(app, /app\.mount\('#app'\)/)
assert.match(app, /window\.__KFE_APP_MOUNTED__ = true/)
console.log('KFE Phase 12 final release-readiness contract: PASS')
