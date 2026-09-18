import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMutationRecord } from '../repositories/mutationRepository.js'
import { SyncService } from '../services/syncService.js'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '..')

async function runContractTests() {
  console.log('--- Running KFE Offline Sync Contract Tests ---')
  const repositoryContracts = [
    ['shiftTripRepository.js', ['shifts', 'trips', 'pending_mutations', 'audit_history']],
    ['fuelRepository.js', ['fuel_logs', 'pending_mutations', 'audit_history']],
    ['odoGapRepository.js', ['odoGaps', 'pending_mutations', 'audit_history']]
  ]
  for (const [file, stores] of repositoryContracts) {
    const source = fs.readFileSync(path.join(srcRoot, 'repositories', file), 'utf8')
    assert(stores.every(store => source.includes(`'${store}'`)), `${file}: canonical transaction stores missing`)
    assert(source.includes("'readwrite'"), `${file}: canonical readwrite transaction missing`)
    assert(source.includes('pending_mutations'), `${file}: mutation store missing`)
    assert(source.includes('audit_history'), `${file}: audit store missing`)
    assert(source.includes('tx.oncomplete'), `${file}: commit completion handling missing`)
  }
  const dbSource = fs.readFileSync(path.join(srcRoot, 'utils', 'indexedDB.js'), 'utf8')
  assert(dbSource.includes('CANONICAL_DB_VERSION = 11'), 'Canonical DB version is not v11')
  for (const store of ['shifts', 'fuel_logs', 'odoGaps', 'pending_mutations', 'audit_history', 'days', 'trips', 'vehicles', 'drivers', 'settings']) assert(dbSource.includes(`'${store}'`), `Canonical store missing: ${store}`)
  assert(!dbSource.includes("createSimpleStore(db, 'driver_collected_data'"), 'Removed driver-collected store must not be recreated')
  assert(dbSource.includes("deleteObjectStore('driver_collected_data')"), 'Removed driver-collected store migration missing')
  assert(dbSource.includes("deleteObjectStore('admin_records')"), 'Legacy admin_records cleanup missing')
  assert(dbSource.includes("deleteObjectStore('financial_inputs')"), 'Legacy financial_inputs cleanup missing')

  const mutation = buildMutationRecord({ entityId: 'entity-1', entityType: 'SHIFT', action: 'CREATE', payload: { id: 'entity-1', revenue: 1000 }, createdAt: '2026-09-12T10:00:00.000Z' })
  const second = buildMutationRecord({ entityId: 'entity-2', entityType: 'FUEL', action: 'CREATE', payload: { id: 'entity-2' }, createdAt: '2026-09-12T10:00:01.000Z' })
  assert(mutation.id && mutation.id !== mutation.entityId, 'Dual-ID contract failed')
  assert(mutation.entityId === 'entity-1' && mutation.status === 'PENDING', 'Mutation envelope contract failed')
  assert([second, mutation].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].id === mutation.id, 'Chronological ordering contract failed')

  const syncSource = fs.readFileSync(path.join(srcRoot, 'services', 'syncService.js'), 'utf8')
  assert(syncSource.includes('mutationId: mutation.id'), 'mutationId missing from sync envelope')
  assert(syncSource.includes('entityId: mutation.entityId'), 'entityId missing from sync envelope')
  assert(syncSource.includes('break'), 'halt-on-first-failure protection missing')

  const calls = []
  const previousNavigator = globalThis.navigator
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  const repo = await import('../repositories/mutationRepository.js')
  const originals = { recoverStaleSyncing: repo.MutationRepository.recoverStaleSyncing, getPending: repo.MutationRepository.getPending, updateStatus: repo.MutationRepository.updateStatus, remove: repo.MutationRepository.remove }
  repo.MutationRepository.recoverStaleSyncing = async () => {}
  repo.MutationRepository.getPending = async () => [mutation, second]
  repo.MutationRepository.updateStatus = async (id, status) => calls.push(['status', id, status])
  repo.MutationRepository.remove = async (id) => calls.push(['remove', id])
  try {
    const apiClient = { post: async (_path, envelope) => { calls.push(['post', envelope.mutationId]); if (envelope.mutationId === mutation.id) throw new Error('simulated network failure') } }
    const result = await SyncService.processQueue(apiClient)
    assert(result.status === 'PARTIAL_FAILURE' && result.processedCount === 0 && result.failureCount === 1, 'Halt-on-first-failure contract failed')
    assert(calls.some(entry => entry[0] === 'post' && entry[1] === mutation.id), 'First mutation was not attempted')
    assert(!calls.some(entry => entry[0] === 'post' && entry[1] === second.id), 'Queue continued after failure')
    assert(calls.some(entry => entry[0] === 'status' && entry[1] === mutation.id && entry[2] === 'FAILED'), 'FAILED state was not recorded')
  } finally {
    Object.assign(repo.MutationRepository, originals)
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator })
  }
  console.log('✅ Offline Sync Contract Tests Passed Successfully!')
}
runContractTests().catch(error => { console.error('❌ Offline Sync Contract Tests Failed:', error); process.exitCode = 1 })
