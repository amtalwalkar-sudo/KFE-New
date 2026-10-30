const requiredMethods = Object.freeze({
  nativeWorkActions: ['clearPendingAction', 'addListener', 'consumePendingActions', 'consumePendingAction', 'acknowledgeAction', 'recordActionFailure'],
  canonicalWork: ['putRecord', 'getRecord', 'listRecords', 'getOperation', 'isAvailable', 'prepareCreateIntent', 'completeCreateIntent', 'migrateLegacySnapshot', 'verifyLegacyMigration', 'getMigration', 'beginCanonicalReset', 'clearCanonicalReset', 'completeCanonicalReset', 'releaseCanonicalReset', 'getCanonicalResetState'],
  browserCanonicalWork: ['putRecord', 'getRecord', 'listRecords', 'getOperation'],
  gpsPermissions: ['isNativePlatform', 'getLocationStatus', 'openBackgroundLocationSettings', 'requestLocationPermissions', 'requestBackgroundLocationPermission'],
  diagnostics: ['start', 'waiting', 'checkpoint', 'error', 'complete', 'snapshot', 'subscribe', 'clear'],
  androidOverlay: ['hide', 'update', 'prepare', 'fareSaved', 'cancelSaved'],
  platform: ['getPlatform', 'getStartupPermissionStatus', 'requestStartupPermission', 'openStartupSetting'],
  tripBoundaryLocation: ['queueEventLocationCapture', 'captureOneShotLocation'],
})

let configuredPorts = null

export const configureWorkRuntimePorts = ports => {
  for (const [group, methods] of Object.entries(requiredMethods)) {
    if (!ports?.[group] || methods.some(method => typeof ports[group][method] !== 'function')) {
      throw new TypeError(`Invalid Work runtime adapter: ${group} is incomplete.`)
    }
  }
  configuredPorts = ports
}

const createPortProxy = group => new Proxy(Object.create(null), {
  get(_target, method) {
    if (typeof method !== 'string') return undefined
    return (...args) => {
      const target = configuredPorts?.[group]
      const operation = target?.[method]
      if (typeof operation !== 'function') throw new Error(`Work runtime port "${group}.${method}" is not configured.`)
      return operation.apply(target, args)
    }
  },
})

export const WorkRuntimePorts = Object.freeze({
  nativeWorkActions: createPortProxy('nativeWorkActions'),
  canonicalWork: createPortProxy('canonicalWork'),
  browserCanonicalWork: createPortProxy('browserCanonicalWork'),
  gpsPermissions: createPortProxy('gpsPermissions'),
  diagnostics: createPortProxy('diagnostics'),
  androidOverlay: createPortProxy('androidOverlay'),
  platform: createPortProxy('platform'),
  tripBoundaryLocation: createPortProxy('tripBoundaryLocation'),
})
