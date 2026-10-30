import { WorkDraftService } from './workDraftService.js'

/**
 * Owns serialized Work-form draft persistence independently of the view.
 * Drafts are recovery aids only: they are never auto-submitted.
 */
export const createWorkDraftController = ({ service = WorkDraftService, isRestoring = () => false, onFailure = () => {} } = {}) => {
  if (!service || typeof service.get !== 'function' || typeof service.save !== 'function' || typeof service.clear !== 'function') {
    throw new TypeError('A complete Work draft service is required.')
  }
  let writeQueue = Promise.resolve()
  const committedKeys = new Set()
  const identityKey = identity => JSON.stringify([
    identity?.formId, identity?.workflowStep, identity?.parentType,
    identity?.parentId || null, identity?.ownerId || null, identity?.workflowId || null,
  ])

  const restore = async identity => {
    try { return await service.get(identity) } catch (_) { return null }
  }

  const save = (identity, values) => {
    if (isRestoring() || committedKeys.has(identityKey(identity))) return writeQueue
    writeQueue = writeQueue.then(() => service.save(identity, values)).catch(() => {
      onFailure('Draft could not be saved locally. Keep this form open and retry.')
      return null
    })
    return writeQueue
  }

  const clearCommitted = async (identity, { quiet = false } = {}) => {
    committedKeys.add(identityKey(identity))
    await writeQueue
    try { await service.clear(identity, { committed: true }) }
    catch (_) {
      if (!quiet) onFailure('The record was saved, but its temporary draft could not be cleared. Do not replay it; reopen the record and verify the saved value.')
    }
  }

  const latestWorkflow = (...args) => service.latestWorkflow(...args)
  const newWorkflowId = () => service.newWorkflowId()

  return Object.freeze({ restore, save, clearCommitted, latestWorkflow, newWorkflowId })
}
