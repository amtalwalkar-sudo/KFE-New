import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CloudSyncService } from '../application/sync/cloudSyncService.js'
import { MutationRepository, buildMutationRecord } from '../repositories/mutationRepository.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, '..', 'application', 'sync', 'cloudSyncService.js'), 'utf8')

assert(source.includes("../../repositories/mutationRepository.js"), 'Cloud sync must use the mutation repository boundary')
assert(!source.includes('dropbox') && !source.includes('supabase') && !source.includes('firebase'), 'Cloud sync application layer must remain provider-independent')
assert.equal(CloudSyncService.getCloudSyncProviderName(), null)
assert.deepEqual(await CloudSyncService.syncNow({ online: false }), { status: 'OFFLINE', pushed: 0, pulled: 0 })
await assert.rejects(() => CloudSyncService.syncNow({ online: true }), /No cloud sync provider is configured/)

const mutation = buildMutationRecord({ entityId: 'entity-1', entityType: 'SHIFT', action: 'CREATE', payload: { id: 'entity-1' }, createdAt: '2026-09-17T00:00:00.000Z' })
const remote = { mutationId: 'remote-1', entityId: 'entity-2', entityType: 'TRIP', action: 'CREATE', payload: { id: 'entity-2' } }
const calls = []
const originals = { recoverStaleSyncing: MutationRepository.recoverStaleSyncing, getPending: MutationRepository.getPending, updateStatus: MutationRepository.updateStatus, remove: MutationRepository.remove }
MutationRepository.recoverStaleSyncing = async () => {}
MutationRepository.getPending = async () => [mutation]
MutationRepository.updateStatus = async (id, status) => calls.push(['status', id, status])
MutationRepository.remove = async id => calls.push(['remove', id])
try {
  const provider = {
    name: 'Test Cloud',
    sync: async ({ mutations }) => {
      assert.equal(mutations.length, 1)
      assert.equal(mutations[0].id, mutation.id)
      return { acknowledgedMutationIds: [mutation.id], changes: [remote], nextCursor: 'cursor-2' }
    },
  }
  assert.equal(CloudSyncService.registerCloudSyncProvider(provider), 'Test Cloud')
  const applied = []
  const result = await CloudSyncService.syncNow({ online: true, applyRemoteChanges: async changes => applied.push(changes) })
  assert.deepEqual(result, { status: 'SUCCESS', pushed: 1, pulled: 1, cursor: 'cursor-2' })
  assert.deepEqual(applied, [[remote]])
  assert(calls.some(entry => entry[0] === 'status' && entry[1] === mutation.id && entry[2] === 'SYNCING'), 'Mutation must enter SYNCING before provider call')
  assert(calls.some(entry => entry[0] === 'remove' && entry[1] === mutation.id), 'Acknowledged mutation must be removed')

  const second = structuredClone(mutation); second.id = 'mutation-2'
  MutationRepository.getPending = async () => [second]
  const failingProvider = { name: 'Failing Cloud', sync: async () => { throw new Error('network unavailable') } }
  CloudSyncService.registerCloudSyncProvider(failingProvider)
  const failed = await CloudSyncService.syncNow({ online: true })
  assert.equal(failed.status, 'FAILED')
  assert(failed.error instanceof Error)
  assert(calls.some(entry => entry[0] === 'status' && entry[1] === second.id && entry[2] === 'FAILED'), 'Provider failure must preserve a retryable FAILED mutation state')
} finally {
  Object.assign(MutationRepository, originals)
}

console.log('Phase 9 Cloud Backup / Sync contract: PASS')
