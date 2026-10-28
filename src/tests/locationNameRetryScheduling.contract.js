import assert from 'node:assert/strict'
import fs from 'node:fs'

const eventLocations = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const worker = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeLocationNameWorker.java', 'utf8')
const store = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const activity = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/MainActivity.java', 'utf8')
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8')

assert.match(eventLocations, /window|globalThis\.navigator\?\.onLine === false/,
  'offline app paths must defer reverse geocoding rather than polling')
assert.match(eventLocations, /LOCATION_RETRY_DELAYS = \[60_000, 5 \* 60_000, 30 \* 60_000, 2 \* 60 \* 60_000, 12 \* 60 \* 60_000\]/,
  'browser retries must use bounded exponential-style delays')
assert.match(eventLocations, /localStorage\?\.setItem\(LOCATION_RETRY_KEY/,
  'retry state must survive WebView reloads and app restarts')
assert.match(eventLocations, /globalThis\.setTimeout\(\(\) =>/,
  'retry scheduling must use one-shot timers rather than polling')
assert.match(eventLocations, /resolveLocationNameWithRetry\(snapshot, locationNameResolver\)/,
  'persisted unresolved coordinates must use the bounded retry pathway')

assert.match(worker, /setRequiredNetworkType\(NetworkType\.CONNECTED\)/,
  'Android enrichment must wait for network connectivity')
assert.match(worker, /setBackoffCriteria\(androidx\.work\.BackoffPolicy\.EXPONENTIAL, 30, TimeUnit\.SECONDS\)/,
  'Android retries must back off rather than loop')
assert.match(worker, /MAX_RETRIES = 5/,
  'Android background retries must be bounded')
assert.match(worker, /geocodeAttemptedAt/,
  'a successful lookup with no locality must not cause an endless queue loop')
assert.match(worker, /snapshot\.put\("placeName", label\)/,
  'the worker should enrich the saved snapshot label')
assert.doesNotMatch(worker, /latitude\"\s*,\s*location|capturedAt\"\s*,\s*Instant\.now/,
  'reverse geocoding must not replace saved coordinates or capture timestamps')
assert.match(store, /KfeLocationNameWorker\.enqueue\(appContext\)/,
  'new unresolved native GPS snapshots must durably enqueue background enrichment')
assert.match(activity, /KfeLocationNameWorker\.enqueue\(this\)/,
  'startup must recover pending locality work after process recreation')
assert.match(gradle, /androidx\.work:work-runtime:2\.10\.1/,
  'Android must include WorkManager runtime')

console.log('PASS: GPS locality enrichment is connectivity-driven, persisted, bounded, and battery-conscious')
