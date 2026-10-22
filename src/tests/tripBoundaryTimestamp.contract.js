import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeTripBoundaryLocation } from '../application/work/tripBoundaryLocation.js'

const valid = normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, accuracy: 12, capturedAt: '2026-10-22T05:30:00.000Z' })
assert.equal(valid.capturedAt, '2026-10-22T05:30:00.000Z', 'the original GPS fix timestamp must be preserved')
assert.equal(valid.latitude, 19.076)
assert.equal(valid.longitude, 72.8777)
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777 }), null, 'a location without a fix timestamp must not receive a fabricated current timestamp')
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, capturedAt: 'not-a-date' }), null, 'an invalid fix timestamp must make the snapshot unavailable')
assert.equal(normalizeTripBoundaryLocation({ latitude: 19.076, longitude: 72.8777, capturedAt: 0 }), null, 'a non-positive fix timestamp must not be treated as a real GPS fix time')

const plugin = fs.readFileSync('android/app/src/main/java/com/kanishka/pwa/KfeTripBoundaryLocationPlugin.java', 'utf8')
assert.match(plugin, /if \(location == null \|\| location\.getTime\(\) <= 0L\) return null;/, 'native snapshot must reject a missing provider timestamp')
assert.doesNotMatch(plugin, /location\.getTime\(\) > 0L \? location\.getTime\(\) : System\.currentTimeMillis\(\)/, 'native snapshot must never replace fix time with current time')
console.log('PASS: trip-boundary snapshots preserve only actual GPS fix timestamps')
