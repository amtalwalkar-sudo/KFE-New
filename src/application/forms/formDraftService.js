import { FormDraftRepository } from '../../repositories/formDraftRepository.js'

// Shared application boundary for temporary, parent-scoped form drafts.
// Serialize writes and clears so a late keystroke cannot recreate a draft
// after the parent has successfully committed and cleared it.
let mutationQueue = Promise.resolve()
const enqueue = operation => {
  const result = mutationQueue.then(operation)
  mutationQueue = result.catch(() => null)
  return result
}

export const FormDraftService = Object.freeze({
  get: identity => FormDraftRepository.get(identity),
  save: (identity, values) => enqueue(() => FormDraftRepository.save(identity, values)),
  clear: (identity, options) => enqueue(() => FormDraftRepository.clear(identity, options)),
  latestWorkflow: (formId, step, parentType) => FormDraftRepository.latestWorkflow(formId, step, parentType),
  newWorkflowId: () => FormDraftRepository.newWorkflowId()
})
