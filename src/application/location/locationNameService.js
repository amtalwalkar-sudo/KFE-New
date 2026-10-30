import { WorkRuntimePorts } from '../work/workRuntimePorts.js'

// Application boundary for explicit Timeline pull-to-refresh locality lookups.
// Network access and the locality cache are owned by infrastructure.
export const resolveLocationNameDetailed = (...args) => WorkRuntimePorts.locationNames.resolveLocationNameDetailed(...args)
export const resolveLocationName = (...args) => WorkRuntimePorts.locationNames.resolveLocationName(...args)
export const localityResolutionCacheKey = (...args) => WorkRuntimePorts.locationNames.localityResolutionCacheKey(...args)
export const getCachedLocationName = (...args) => WorkRuntimePorts.locationNames.getCachedLocationName(...args)
