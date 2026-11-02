import { WorkRuntimePorts } from '../work/workRuntimePorts.js'

// Application boundary for asynchronous PWA locality resolution.
// Network access is owned by the locality infrastructure adapter; permanent labels are stored by LocalityRepository.
export const resolveLocationNameDetailed = (...args) => WorkRuntimePorts.locationNames.resolveLocationNameDetailed(...args)
export const resolveLocationName = (...args) => WorkRuntimePorts.locationNames.resolveLocationName(...args)
