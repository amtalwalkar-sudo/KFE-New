import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMutationRecord, buildAuditRecord, writeMutationAndAudit, MUTATION_VERSION } from '../repositories/mutationRepository.js'

assert.equal(MUTATION_VERSION, 1)
const mutation = buildMutationRecord({ entityId: 'entity-1', entityType: 'TEST', action: 'CREATE', payload: { id: 'entity-1', value: 1 }, createdAt: '2026-09-16T00:00:00.000Z' })
assert.equal(mutation.mutationVersion, 1)
assert.equal(mutation.status, 'PENDING')
assert.equal(mutation.retryCount, 0)
assert.equal(typeof mutation.id, 'string')
assert.notStrictEqual(mutation.payload, undefined)
const audit = buildAuditRecord({ mutationId: mutation.id, entityId: mutation.entityId, entityType: mutation.entityType, action: mutation.action, payload: mutation.payload, createdAt: mutation.createdAt })
assert.equal(audit.auditVersion, 1)
assert.equal(audit.mutationId, mutation.id)
assert.equal(audit.entityId, mutation.entityId)

const writes = []
const mutationStore = { put(value) { writes.push(['mutation', value]) } }
const auditStore = { put(value) { writes.push(['audit', value]) } }
const written = writeMutationAndAudit(mutationStore, auditStore, { entityId: 'entity-2', entityType: 'TEST', action: 'UPDATE', payload: { id: 'entity-2' }, createdAt: '2026-09-16T00:01:00.000Z' })
assert.equal(writes.length, 2)
assert.equal(writes[0][1].id, written.id)
assert.equal(writes[1][1].mutationId, written.id)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const indexedDb = read('utils/indexedDB.js')
assert.match(indexedDb, /CANONICAL_DB_VERSION\\s*=\\s*13/)
assert.match(indexedDb, /audit_history/)
assert.match(indexedDb, /deleteObjectStore\('driver_collected_data'\)/)

const mutationWriters = [
  'repositories/adminRepository.js',
  'repositories/fuelRepository.js',
  'repositories/odoGapRepository.js',
  'repositories/shiftTripRepository.js',
  'repositories/movementArtifactRepository.js',
  'repositories/locationRepository.js'
]
for (const relative of mutationWriters) {
  const source = read(relative)
  assert.match(source, /writeMutationAndAudit/, `${relative} must use the canonical mutation/audit writer.`)
  assert.match(source, /audit_history/, `${relative} must include audit_history in its mutation transaction.`)
}

console.log('KFE Audit/Mutation Integrity contract: PASS')
