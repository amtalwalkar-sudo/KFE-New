import { registerPlugin, Capacitor } from '@capacitor/core'

const KfeRideNotifications = registerPlugin('KfeRideNotifications')
const KEY = 'kfe.ride.notification.workflow.v1'
const TWO_MINUTES = 2 * 60 * 1000

const native = () => Capacitor?.isNativePlatform?.() === true

const state = {
  tripId: null,
  phase: null,
  pickupDurationMinutes: null,
  rideDurationMinutes: null
}

const persist = () => localStorage.setItem(KEY, JSON.stringify(state))
const restore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (parsed) Object.assign(state, parsed)
  } catch (_) {}
}

const call = async (method, options) => {
  if (!native()) return false
  try { await KfeRideNotifications[method](options); return true } catch (_) { return false }
}

export const KfeRideNotificationService = Object.freeze({
  restore,
  getState: () => ({ ...state }),
  async goOnline() {
    restore()
    if (state.phase && state.phase !== 'GO_TO_PICKUP') return true
    await call('requestPermission')
    state.phase = 'GO_TO_PICKUP'
    state.tripId = null
    persist()
    return call('show', { stage: 'GO_TO_PICKUP', tripId: '' })
  },
  async beginPickup(tripId) {
    restore()
    state.tripId = tripId
    state.phase = 'ENTER_PICKUP_DURATION'
    persist()
    await call('cancel')
    return call('schedule', { stage: 'ENTER_PICKUP_DURATION', tripId, delayMs: TWO_MINUTES })
  },
  async setPickupDuration(minutes) {
    const value = Number(minutes)
    if (!Number.isFinite(value) || value <= 0) return false
    state.pickupDurationMinutes = value
    state.phase = 'START_RIDE'
    persist()
    await call('show', { stage: 'START_RIDE', tripId: state.tripId })
    return true
  },
  async startRide(tripId) {
    restore()
    const previousTripId = state.tripId
    if (previousTripId) await call('clearScheduled', { stage: 'ENTER_PICKUP_DURATION', tripId: previousTripId })
    state.tripId = tripId || state.tripId
    state.phase = 'ENTER_RIDE_DURATION'
    persist()
    return call('schedule', { stage: 'ENTER_RIDE_DURATION', tripId: state.tripId, delayMs: TWO_MINUTES })
  },
  async setRideDuration(minutes) {
    const value = Number(minutes)
    if (!Number.isFinite(value) || value <= 0) return false
    state.rideDurationMinutes = value
    state.phase = 'END_RIDE'
    persist()
    await call('schedule', { stage: 'END_RIDE', tripId: state.tripId, delayMs: value * 60 * 1000 })
    return true
  },
  async retryEndRide() {
    restore()
    state.phase = 'END_RIDE'
    persist()
    return call('show', { stage: 'END_RIDE', tripId: state.tripId })
  },
  async resume() {
    restore()
    if (state.phase === 'GO_TO_PICKUP') return call('show', { stage: 'GO_TO_PICKUP', tripId: '' })
    if (!state.tripId) return false
    if (state.phase === 'ENTER_PICKUP_DURATION') return call('show', { stage: 'ENTER_PICKUP_DURATION', tripId: state.tripId })
    if (state.phase === 'START_RIDE') return call('show', { stage: 'START_RIDE', tripId: state.tripId })
    if (state.phase === 'ENTER_RIDE_DURATION') return call('show', { stage: 'ENTER_RIDE_DURATION', tripId: state.tripId })
    if (state.phase === 'END_RIDE') return call('show', { stage: 'END_RIDE', tripId: state.tripId })
    return false
  },
  async completeRide() {
    const completedTripId = state.tripId
    if (completedTripId) {
      await call('clearScheduled', { stage: 'ENTER_RIDE_DURATION', tripId: completedTripId })
      await call('clearScheduled', { stage: 'END_RIDE', tripId: completedTripId })
    }
    state.phase = 'GO_TO_PICKUP'
    state.tripId = null
    state.pickupDurationMinutes = null
    state.rideDurationMinutes = null
    persist()
    return call('show', { stage: 'GO_TO_PICKUP', tripId: '' })
  },
  async clear() {
    state.tripId = null
    state.phase = null
    state.pickupDurationMinutes = null
    state.rideDurationMinutes = null
    persist()
    return call('cancel')
  },
  addListener(event, handler) {
    // The web/PWA build has no native notification bridge. Keep listener setup
    // safe on web so opening the app never throws "plugin is not implemented".
    if (!native()) {
      return Promise.resolve({ remove: async () => {} })
    }
    return KfeRideNotifications.addListener(event, handler)
  }
})
