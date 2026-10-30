import { WorkRuntimePorts } from '../work/workRuntimePorts.js'

// Application-facing diagnostics port; runtime storage and event delivery are
// supplied by infrastructure during bootstrap.
export const DiagnosticService = Object.freeze({
  start: (...args) => WorkRuntimePorts.diagnostics.start(...args),
  waiting: (...args) => WorkRuntimePorts.diagnostics.waiting(...args),
  checkpoint: (...args) => WorkRuntimePorts.diagnostics.checkpoint(...args),
  error: (...args) => WorkRuntimePorts.diagnostics.error(...args),
  complete: (...args) => WorkRuntimePorts.diagnostics.complete(...args),
  snapshot: (...args) => WorkRuntimePorts.diagnostics.snapshot(...args),
  subscribe: (...args) => WorkRuntimePorts.diagnostics.subscribe(...args),
  clear: (...args) => WorkRuntimePorts.diagnostics.clear(...args),
})
