import assert from 'node:assert/strict'
import fs from 'node:fs'

const eventLocations = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const worker = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeLocationNameWorker.java', 'utf8')
const store = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeCanonicalWorkStore.java', 'utf8')
const activity = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/MainActivity.java', 'utf8')
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8')

assert.match(eventLocations, /ConnectivityService\.isNetworkAvailable\(\)/,
  'offline app paths must use the shared connectivity service rather than polling')
assert.match(eventLocations, /LOCATION_RETRY_DELAYS = \[60_000, 5 \* 60_000, 30 \* 60_000, 2 \* 60 \* 60_000, 12 \* 60 \* 60_000\]/,
  'browser retries must use bounded exponential-style delays')
assert.match(eventLocations, /localStorage\?\.setItem\(LOCATION_RETRY_KEY/,
  'retry state must survive WebView reloads and app restarts')
assert.match(eventLocations, /globalThis\.setTimeout\(\(\) =>/,
  'feature-specific retry scheduling must use one-shot timers rather than polling')
assert.match(eventLocations, /resolveLocationNameWithRetry\(snapshot, locationNameResolver\)/,
  'persisted unresolved coordinates must use the bounded retry pathway')

assert.match(worker, /setRequiredNetworkType\(NetworkType\.CONNECTED\)/,
  'Android enrichment must wait for network connectivity')
assert.match(worker, /setBackoffCriteria\(BackoffPolicy\.EXPONENTIAL, 30, TimeUnit\.SECONDS\)/,
  'Android transport retries must back off rather than loop')
assert.match(worker, /MAX_RETRIES = 5/,
  'Android background retries must be bounded')
assert.match(worker, /geocodeAttemptCount/,
  'each locality lookup attempt must be counted durably')
assert.match(worker, /geocodeNextAttemptAt/,
  'empty locality responses must persist a future retry deadline instead of becoming terminal')
assert.match(worker, /LOCALITY_RETRY_DELAYS_MS = \{/,
  'native locality retries must use bounded backoff intervals')
assert.match(worker, /enqueueContinuation\(getApplicationContext\(\), Math\.max\(1L, earliestRetryAt - System\.currentTimeMillis\(\)\)\)/,
  'the worker must schedule the next due enrichment attempt without polling')
assert.match(worker, /Older builds wrote geocodeAttemptedAt and then permanently skipped that/,
  'legacy snapshots marked attempted without a locality must become retryable')
assert.match(worker, /snapshot\.put\("geocodeAttemptedAt", Instant\.ofEpochMilli\(attemptedAt\)\.toString\(\)\)/,
  'the attempt timestamp remains diagnostic history, not a completion flag')
assert.match(worker, /snapshot\.put\("placeName", label\.trim\(\)\)/,
  'the worker should enrich the saved snapshot label')
assert.doesNotMatch(worker, /latitude\"\s*,\s*location|capturedAt\"\s*,\s*Instant\.now/,
  'reverse geocoding must not replace saved coordinates or capture timestamps')
assert.match(store, /KfeLocationNameWorker\.enqueue\(appContext\)/,
  'new unresolved native GPS snapshots must durably enqueue background enrichment')
assert.match(activity, /KfeLocationNameWorker\.enqueue\(this\)/,
  'startup must recover pending locality work after process recreation')
assert.match(gradle, /androidx\.work:work-runtime:2\.10\.1/,
  'Android must include WorkManager runtime')

const overlay = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java', 'utf8')
const mainActivity = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/MainActivity.java', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')
assert.doesNotMatch(overlay, /foregroundCheck|postDelayed\(this,\s*500L\)/,
  'overlay visibility must be lifecycle-driven rather than checked every 500 ms')
assert.match(mainActivity, /KfeOverlayService\.onPwaActivityResumed\(\)/,
  'overlay minimization must be triggered by the Android activity lifecycle')
assert.match(overlay, /GPS_RETRY_DELAYS_MS=\{30_000L,60_000L,2\*60_000L,5\*60_000L,15\*60_000L,30\*60_000L\}/,
  'failed GPS fixes must back off to a 30-minute cap without dropping the durable request')
assert.match(overlay, /isValidPersistedEventGpsSnapshot\(snapshot\)/,
  'an existing malformed GPS snapshot must not silently satisfy a pending event capture')
assert.match(overlay, /Double\.isFinite\(latitude\).*Double\.isFinite\(longitude\)/s,
  'persisted event coordinates must be validated before treating capture as complete')
assert.match(overlay, /recordPendingGpsFailure\(tripId,eventType\)/,
  'failed GPS attempts must persist their retry deadline')
assert.match(overlay, /item\.put\("nextAttemptAt",now\+delay\)/,
  'GPS retry deadlines must survive service and process restarts')
assert.match(eventLocations, /nativeSnapshotMatches\(snapshot, nativeSnapshot\)/,
  'reconciliation must avoid rewriting unchanged native snapshots')
assert.match(eventLocations, /LocationRepository\.all\(\)/,
  'post-migration reconciliation must read snapshots in one pass rather than querying each trip')
assert.doesNotMatch(eventLocations, /retry\.nextAttemptAt = Date\.now\(\)/,
  'resume and visibility events must not bypass persisted locality retry backoff')
assert.match(eventLocations, /LOCATION_RECONCILIATION_KEY, 'complete'/,
  'legacy trip-boundary migration must be marked complete before later passes become incremental')
assert.match(locationRepository, /async all\(\)/,
  'local snapshot reconciliation must support one-pass indexed reads')

console.log('PASS: GPS locality enrichment is connectivity-driven, persisted, bounded, and battery-conscious')
