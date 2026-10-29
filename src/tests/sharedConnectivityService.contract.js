import assert from 'node:assert/strict'
import fs from 'node:fs'

const connectivity = fs.readFileSync('src/infrastructure/connectivity/connectivityService.js', 'utf8')
const eventLocations = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const nativeConnectivity = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeConnectivityService.java', 'utf8')
const main = fs.readFileSync('src/main.js', 'utf8')

assert.match(connectivity, /addEventListener\('online'/, 'shared browser adapter must react to online events')
assert.match(connectivity, /addEventListener\('offline'/, 'shared browser adapter must react to offline events')
assert.match(connectivity, /pageshow/, 'shared adapter must recover after app lifecycle restoration')
assert.match(connectivity, /subscribe\(listener/, 'future features must have a reusable subscription API')
assert.match(connectivity, /internetAvailable: networkAvailable \? null : false/,
  'browser online hints must not be misrepresented as validated internet')
assert.doesNotMatch(connectivity, /setInterval|setTimeout|fetch\(/,
  'shared connectivity monitoring must not poll or probe the internet')
assert.match(eventLocations, /ConnectivityService\.isNetworkAvailable\(\)/,
  'reverse geocoding must use the shared connectivity adapter')
assert.doesNotMatch(eventLocations, /ConnectivityService\.subscribe\(/,
  'saved GPS locality enrichment must never be triggered by shared connectivity events')
assert.match(eventLocations, /async refreshUnresolvedLocationNames\(/,
  'locality resolution must be initiated only through the explicit manual refresh service')
assert.match(eventLocations, /await LocationRepository\.record\(/,
  'GPS coordinates must be persisted before optional network enrichment')
assert.match(nativeConnectivity, /registerNetworkCallback/, 'native connectivity observers must be event-driven')
assert.match(nativeConnectivity, /NET_CAPABILITY_VALIDATED/, 'native adapter must distinguish validated internet')
assert.doesNotMatch(nativeConnectivity, /while\s*\(|Thread\.sleep|postDelayed|scheduleAtFixedRate/,
  'native connectivity monitoring must not poll')
assert.match(main, /ConnectivityService/, 'application startup must use the shared connectivity service')

console.log('PASS: shared connectivity foundation remains event-driven; locality requests are manual-only')
