import { FormDraftRepository } from '../../repositories/formDraftRepository.js'

// Work presentation uses this application boundary instead of accessing persistence directly.
export const WorkDraftService = Object.freeze({
  get: identity => FormDraftRepository.get(identity),
  save: (identity, values) => FormDraftRepository.save(identity, values),
  clear: (identity, options) => FormDraftRepository.clear(identity, options),
  latestWorkflow: (formId, step, parentType) => FormDraftRepository.latestWorkflow(formId, step, parentType),
  newWorkflowId: () => FormDraftRepository.newWorkflowId(),
})
