const requiredMethods = Object.freeze({
  movementTrace: ['start', 'reset', 'getActiveSession', 'getPoints', 'stop', 'resumePersisted', 'pause', 'getDistanceKm'],
  nativeGps: ['start', 'stop', 'readTrace', 'syncTrace'],
  rideNotifications: ['getState', 'goOnline', 'beginPickup', 'startRide', 'completeRide', 'clearPendingAction', 'clear', 'addListener', 'consumePendingActions', 'consumePendingAction', 'resume', 'acknowledgeAction', 'recordActionFailure'],
  androidOverlay: ['hide', 'update', 'prepare', 'fareSaved', 'cancelSaved'],
  routing: ['createRouter'],
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
  movementTrace: createPortProxy('movementTrace'),
  nativeGps: createPortProxy('nativeGps'),
  rideNotifications: createPortProxy('rideNotifications'),
  androidOverlay: createPortProxy('androidOverlay'),
  routing: createPortProxy('routing'),
})
