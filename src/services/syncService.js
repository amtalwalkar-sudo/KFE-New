import { MutationRepository } from '../repositories/mutationRepository.js'

export const SyncService = {
  isSyncing: false,

  async processQueue(apiClient) {
    if (this.isSyncing) return { status: 'IN_PROGRESS' }
    if (!navigator.onLine) return { status: 'OFFLINE' }
    if (!apiClient || typeof apiClient.post !== 'function') throw new Error('A compatible apiClient is required.')

    this.isSyncing = true
    let processedCount = 0
    let failureCount = 0

    try {
      await MutationRepository.recoverStaleSyncing()
      const pendingMutations = await MutationRepository.getPending()

      for (const mutation of pendingMutations) {
        try {
          await MutationRepository.updateStatus(mutation.id, 'SYNCING')
          await apiClient.post('/sync/mutation', {
            mutationId: mutation.id,
            entityId: mutation.entityId,
            entityType: mutation.entityType,
            action: mutation.action,
            data: mutation.payload
          })
          await MutationRepository.remove(mutation.id)
          processedCount++
        } catch (error) {
          console.error(`Sync failed on mutation ${mutation.id}:`, error)
          try {
            await MutationRepository.updateStatus(mutation.id, 'FAILED')
          } catch (stateError) {
            console.error(`Failed to persist FAILED state for mutation ${mutation.id}:`, stateError)
          }
          failureCount++
          break
        }
      }

      return {
        status: failureCount === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE',
        processedCount,
        failureCount
      }
    } finally {
      this.isSyncing = false
    }
  }
}
