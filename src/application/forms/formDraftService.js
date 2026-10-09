import { FormDraftRepository } from '../../repositories/formDraftRepository.js'

// Shared application boundary for temporary, parent-scoped form drafts.
export const FormDraftService = Object.freeze({
  get: identity => FormDraftRepository.get(identity),
  save: (identity, values) => FormDraftRepository.save(identity, values),
  clear: (identity, options) => FormDraftRepository.clear(identity, options),
  latestWorkflow: (formId, step, parentType) => FormDraftRepository.latestWorkflow(formId, step, parentType),
  newWorkflowId: () => FormDraftRepository.newWorkflowId()
})
