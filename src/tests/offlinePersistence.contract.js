import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMutationRecord, writeMutationAndAudit } from '../repositories/mutationRepository.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

for (const [file, stores] of [
  ['repositories/shiftTripRepository.js', ['shifts','trips','pending_mutations','audit_history']],
  ['repositories/fuelRepository.js', ['fuel_logs','pending_mutations','audit_history']],
  ['repositories/odoGapRepository.js', ['odoGaps','pending_mutations','audit_history']]
]) {
  const source = read(file)
  assert.ok(source.includes("'readwrite'"), `${file}: canonical write transaction missing`)
  assert.ok(source.includes('tx.oncomplete'), `${file}: commit completion handling missing`)
  for (const store of stores) assert.ok(source.includes(`'${store}'`), `${file}: required store ${store} missing`)
}
const db = read('utils/indexedDB.js')
for (const store of ['shifts','trips','fuel_logs','vehicles','drivers','settings','pending_mutations','audit_history','gps_snapshots']) assert.ok(db.includes(`'${store}'`), `Canonical store missing: ${store}`)
assert.match(db, /indexedDB\.open\(name, CANONICAL_DB_VERSION\)/)
assert.match(db, /deleteObjectStore\('driver_collected_data'\)/)

const mutation = buildMutationRecord({ entityId: 'shift-1', entityType: 'SHIFT', action: 'CREATE', payload: { revenue: 100 }, createdAt: '2026-10-30T00:00:00.000Z' })
assert.ok(mutation.id && mutation.id !== mutation.entityId)
assert.equal(mutation.status, 'PENDING')
assert.equal(mutation.retryCount, 0)
const writes = []
const result = writeMutationAndAudit({ put: value => writes.push(['mutation', value]) }, { put: value => writes.push(['audit', value]) }, { entityId: 'shift-2', entityType: 'SHIFT', action: 'UPDATE', payload: { revenue: 200 } })
assert.equal(writes.length, 2)
assert.equal(writes[0][1].id, result.id)
assert.equal(writes[1][1].mutationId, result.id)
assert.doesNotMatch(read('main.js'), /registerNetworkCallback|setInterval\(/)
assert.doesNotMatch(read('infrastructure/startup/platformStartup.js'), /periodicsync/)
console.log('Local-first persistence contract: canonical writes, audit journal, and no automatic connectivity polling.')
