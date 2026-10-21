import assert from 'node:assert/strict'
import fs from 'node:fs'

const work = fs.readFileSync('src/views/WorkModuleView.vue', 'utf8')
const backup = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')

assert.match(work, /clock = ref\(Date\.now\(\)/)
assert.match(work, /const refreshClock = \(\) => \{ clock\.value = Date\.now\(\) \}/)
assert.match(work, /setInterval\(refreshClock, 1000\)/)
assert.match(work, /const tripTimer = computed/)

for (const file of [
  'src/infrastructure/location/movementTraceService.js',
  'src/services/locationService.js',
  'android/app/src/main/java/com/kanishka/pwa/KfeNativeGpsService.java'
]) assert.equal(fs.existsSync(file), false, 'GPS tracking code must not consume background CPU or battery: ' + file)
assert.match(manifest, /ACCESS_FINE_LOCATION/)
assert.match(manifest, /ACCESS_COARSE_LOCATION/)
assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION/)

assert.match(backup, /checkpointTimer !== null/)
assert.match(backup, /setTimeout\(async \(\) =>/)
assert.match(backup, /checkpointRunning/)

console.log('KFE Phase 9 performance, battery and concurrency contract: PASS (no GPS collector).')
