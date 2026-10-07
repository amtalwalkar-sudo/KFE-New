import assert from 'node:assert/strict'
import fs from 'node:fs'

const shell = fs.readFileSync('src/components/shell/KfeShell.vue', 'utf8')
const gps = fs.readFileSync('src/application/location/gpsStatusService.js', 'utf8')
const css = fs.readFileSync('src/styles/kfe-ui.css', 'utf8')
const app = fs.readFileSync('src/main.js', 'utf8')

assert.match(gps, /permissions\.query\(\{ name: 'geolocation' \}\)/)
assert.match(gps, /requestPermission = false/)
assert.match(shell, /requestPermission: true/)
assert.match(gps, /publish\('ready'\)/)
assert.match(gps, /maximumAge: 30000/)
assert.doesNotMatch(shell, /onMounted\(\(\) => \{\n  connectGps\(\)/)
assert.match(css, /:focus-visible/)
assert.match(css, /prefers-reduced-motion:reduce/)
assert.match(css, /safe-area-inset-bottom/)
assert.match(app, /app\.mount\('#app'\)/)
assert.match(app, /window\.__KFE_APP_MOUNTED__ = true/)
console.log('KFE Phase 12 final release-readiness contract: PASS')
