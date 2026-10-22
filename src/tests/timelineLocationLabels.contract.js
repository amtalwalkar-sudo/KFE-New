import assert from 'node:assert/strict'
import fs from 'node:fs'

const timeline = fs.readFileSync('src/views/TimelineView.vue', 'utf8')
const locationService = fs.readFileSync('src/application/location/locationNameService.js', 'utf8')
const eventLocationService = fs.readFileSync('src/application/location/eventLocationService.js', 'utf8')
const locationRepository = fs.readFileSync('src/repositories/locationRepository.js', 'utf8')

assert.match(timeline, /void resolveTimelineLocationLabels\(data\.value\)\.catch\(\(\) => \{\}\)/,
  'timeline location enrichment must not delay rendering')
assert.match(timeline, /EventLocationService\.resolveLabel\(location\)/,
  'trip boundary labels should use the application service')
assert.match(timeline, /locationLabelFor\('FUEL', event\.record\.id, 'FUEL_ENTRY'\)/,
  'fuel timeline should show its resolved locality label')
assert.match(timeline, /EventLocationService\.persistLabel\(snapshot\.id, name\)/,
  'resolved names should be persisted for future timeline reads')
assert.match(locationService, /p\.suburb \|\| p\.neighbourhood \|\| p\.neighborhood \|\| p\.locality \|\| p\.district/,
  'locality fields should take precedence over street names')
assert.doesNotMatch(locationService, /return \[p\.name, p\.street/,
  'the visible formatter must not construct street-address labels')
assert.match(eventLocationService, /LocationRepository\.updatePlaceName\(snapshotId, placeName\)/)
assert.match(locationRepository, /notifyCanonicalDataChanged\(\{ stores: \['gps_snapshots', 'trips'\], reason: 'gps-place-name-enriched' \}\)/)

console.log('PASS: timeline locality enrichment is shared, persisted, and non-blocking')
