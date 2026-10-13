import assert from 'node:assert/strict'
import fs from 'node:fs'
import { CANONICAL_BACKUP_STORES, BackupService } from '../application/backup/backupService.js'

// This is a regression guard for the backup boundary, not a claim that the
// native Valhalla map downloader/engine already exists.
assert.ok(CANONICAL_BACKUP_STORES.includes('gps_snapshots'), 'Canonical GPS evidence must remain part of business backups.')
assert.ok(CANONICAL_BACKUP_STORES.includes('trips'), 'Trip records must remain part of business backups.')
assert.equal(CANONICAL_BACKUP_STORES.includes('offline_maps'), false)
assert.equal(CANONICAL_BACKUP_STORES.includes('valhalla_tiles'), false)
assert.equal(CANONICAL_BACKUP_STORES.includes('routing_tiles'), false)
assert.equal(CANONICAL_BACKUP_STORES.includes('map_files'), false)

const backupSource = fs.readFileSync('src/application/backup/backupService.js', 'utf8')
assert.match(backupSource, /Object\.freeze\(\['financial_period_snapshots'[\s\S]*'gps_snapshots'[\s\S]*'audit_history'\]\)/, 'Backup remains an explicit canonical-store allowlist.')
assert.doesNotMatch(backupSource, /offline-maps|valhalla_tiles|routing_tiles|map_files/i, 'Map files must not be added to the backup service.')
const repositorySource = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
assert.match(repositorySource, /db\.transaction\(stores, 'readonly'\)/, 'Backup reads only its explicit canonical-store list.')
assert.match(repositorySource, /db\.transaction\(stores, 'readwrite'\)/, 'Restore writes only its explicit canonical-store list.')

const spec = fs.readFileSync('docs/offline-valhalla-map-storage.md', 'utf8')
assert.match(spec, /app-specific files directory/i)
assert.match(spec, /included in data backups/i)
assert.match(spec, /replacement phone downloads the standard map package again/i)
assert.match(spec, /do \*\*not\*\* claim the native Valhalla engine/i)

const sample = { format: 'KFE_BACKUP', formatVersion: 4, source: { dbName: 'kanishka_kfe_canonical_db', dbVersion: 15 }, exportedAt: '2026-10-13T00:00:00.000Z', stores: Object.fromEntries(CANONICAL_BACKUP_STORES.map(store => [store, []])) }
sample.stores.gps_snapshots = [{ id: 'gps-evidence-1', latitude: 19.076, longitude: 72.8777, capturedAt: '2026-10-13T00:00:00.000Z' }]
const restored = BackupService.validateBackup(BackupService.serializeBackup(sample))
assert.deepEqual(restored.stores.gps_snapshots, sample.stores.gps_snapshots)
assert.equal(Object.keys(restored.stores).some(name => /map|valhalla|routing_tiles/i.test(name)), false)

console.log('Offline map storage boundary contract: PASS (backup boundary only; native map integration remains pending)')
