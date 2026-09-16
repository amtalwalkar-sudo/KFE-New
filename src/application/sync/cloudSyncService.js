import { MutationRepository } from '../../repositories/mutationRepository.js'

let provider = null
let syncing = false

const requireProvider = () => {
  if (!provider) throw new Error('No cloud sync provider is configured.')
  return provider
}

export const registerCloudSyncProvider = nextProvider => {
  if (!nextProvider || typeof nextProvider.sync !== 'function') throw new TypeError('Cloud sync provider must expose sync().')
  provider = nextProvider
  return nextProvider.name || 'Cloud Sync'
}

export const getCloudSyncProviderName = () => provider?.name || null

export const syncNow = async ({ online = typeof navigator === 'undefined' ? true : navigator.onLine, applyRemoteChanges = async () => {} } = {}) => {
  if (syncing) return { status: 'IN_PROGRESS', pushed: 0, pulled: 0 }
  if (!online) return { status: 'OFFLINE', pushed: 0, pulled: 0 }
  const configured = requireProvider()
  if (typeof applyRemoteChanges !== 'function') throw new TypeError('applyRemoteChanges must be a function.')

  syncing = true
  try {
    await MutationRepository.recoverStaleSyncing()
    const pending = await MutationRepository.getPending()
    for (const mutation of pending) await MutationRepository.updateStatus(mutation.id, 'SYNCING')

    try {
      const result = await configured.sync({ mutations: pending.map(mutation => structuredClone(mutation)) })
      const acknowledged = new Set(Array.isArray(result?.acknowledgedMutationIds) ? result.acknowledgedMutationIds : [])
      for (const mutation of pending) {
        if (acknowledged.has(mutation.id)) await MutationRepository.remove(mutation.id)
        else await MutationRepository.updateStatus(mutation.id, 'PENDING')
      }
      const changes = Array.isArray(result?.changes) ? result.changes : []
      if (changes.length) await applyRemoteChanges(structuredClone(changes))
      return { status: 'SUCCESS', pushed: acknowledged.size, pulled: changes.length, cursor: result?.nextCursor ?? null }
    } catch (error) {
      for (const mutation of pending) {
        try { await MutationRepository.updateStatus(mutation.id, 'FAILED') } catch (_) {}
      }
      return { status: 'FAILED', pushed: 0, pulled: 0, error }
    }
  } finally {
    syncing = false
  }
}

export const CloudSyncService = Object.freeze({ registerCloudSyncProvider, getCloudSyncProviderName, syncNow })
