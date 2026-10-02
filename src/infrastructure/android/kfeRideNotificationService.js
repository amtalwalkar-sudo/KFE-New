import { registerPlugin, Capacitor } from '@capacitor/core'

const KfeRideNotifications = registerPlugin('KfeRideNotifications')
const KEY = 'kfe.ride.notification.workflow.v1'
const TWO_MINUTES = 2 * 60 * 1000
const NOTIFICATIONS_KEY = 'kfe.settings.notifications.v1'

const native = () => Capacitor?.isNativePlatform?.() === true
const state = { tripId: null, phase: null, pickupDurationMinutes: null, rideDurationMinutes: null, lastCancellation: null }
const notificationsEnabled = () => localStorage.getItem(NOTIFICATIONS_KEY) !== 'off'
const persist = () => localStorage.setItem(KEY, JSON.stringify(state))
const restore = () => { try { const parsed = JSON.parse(localStorage.getItem(KEY) || 'null'); if (parsed) Object.assign(state, parsed) } catch (_) {} }
const call = async (method, options) => { if (!native()) return false; try { await KfeRideNotifications[method](options); return true } catch (_) { return false } }

export const KfeRideNotificationService = Object.freeze({
  restore,
  getState: () => ({ ...state }),
  notificationsEnabled,
  setNotificationsEnabled(enabled) { localStorage.setItem(NOTIFICATIONS_KEY, enabled ? 'on' : 'off'); if (!enabled) void call('cancel'); return enabled },
  async goOnline() {
    restore(); state.phase = 'GO_TO_PICKUP'; state.tripId = null; persist()
    if (!notificationsEnabled()) return true
    await call('requestPermission'); return call('show', { stage: 'GO_TO_PICKUP', tripId: '' })
  },
  async beginPickup(tripId) {
    restore(); state.tripId = tripId; state.phase = 'READY_FOR_TRIP'; persist(); await call('cancel')
    if (!notificationsEnabled()) return true
    return call('show', { stage: 'READY_FOR_TRIP', tripId })
  },
  async setPickupDuration(minutes) {
    const value = Number(minutes); if (!Number.isFinite(value) || value <= 0) return false
    state.pickupDurationMinutes = value; state.phase = 'READY_FOR_TRIP'; persist()
    if (!notificationsEnabled()) return true
    await call('show', { stage: 'START_RIDE', tripId: state.tripId }); return true
  },
  async startRide(tripId) {
    restore(); const previousTripId = state.tripId
    if (previousTripId) await call('clearScheduled', { stage: 'ENTER_PICKUP_DURATION', tripId: previousTripId })
    state.tripId = tripId || state.tripId; state.phase = 'RIDE_STARTED'; persist()
    if (!notificationsEnabled()) return true
    return call('show', { stage: 'RIDE_STARTED', tripId: state.tripId })
  },
  async setRideDuration(minutes) {
    const value = Number(minutes); if (!Number.isFinite(value) || value <= 0) return false
    state.rideDurationMinutes = value; state.phase = 'END_RIDE'; persist()
    if (!notificationsEnabled()) return true
    await call('schedule', { stage: 'END_RIDE', tripId: state.tripId, delayMs: value * 60 * 1000 }); return true
  },
  async retryEndRide() {
    restore(); state.phase = 'END_RIDE'; persist()
    if (!notificationsEnabled()) return true
    return call('show', { stage: 'END_RIDE', tripId: state.tripId })
  },
  async resume() {
    restore(); if (!notificationsEnabled()) return true
    if (state.phase === 'GO_TO_PICKUP') return call('show', { stage: 'GO_TO_PICKUP', tripId: '' })
    if (!state.tripId) return false
    if (state.phase === 'ENTER_PICKUP_DURATION') return call('show', { stage: 'ENTER_PICKUP_DURATION', tripId: state.tripId })
    if (state.phase === 'START_RIDE') return call('show', { stage: 'START_RIDE', tripId: state.tripId })
    if (state.phase === 'ENTER_RIDE_DURATION') return call('show', { stage: 'ENTER_RIDE_DURATION', tripId: state.tripId })
    if (state.phase === 'END_RIDE') return call('show', { stage: 'END_RIDE', tripId: state.tripId })
    if (state.phase === 'ENTER_FARE') return call('show', { stage: 'ENTER_FARE', tripId: state.tripId })
    return false
  },
  recordCancellation(tripId, revenue = 0) { state.lastCancellation = { tripId: tripId || null, revenue: Number.isFinite(Number(revenue)) ? Number(revenue) : 0, recordedAt: Date.now() }; persist(); return state.lastCancellation },
  getLastCancellation() { restore(); return state.lastCancellation ? { ...state.lastCancellation } : null },
  async completeRide() {
    const completedTripId = state.tripId
    if (completedTripId) {
      await call('clearScheduled', { stage: 'ENTER_RIDE_DURATION', tripId: completedTripId })
      await call('clearScheduled', { stage: 'END_RIDE', tripId: completedTripId })
    }
    state.phase = 'ENTER_FARE'; state.tripId = completedTripId; state.pickupDurationMinutes = null; state.rideDurationMinutes = null; persist()
    if (!notificationsEnabled()) return true
    return call('show', { stage: 'ENTER_FARE', tripId: completedTripId || '' })
  },
  async clearPendingAction() { if (!native()) return false; try { await KfeRideNotifications.clearPendingAction(); return true } catch (_) { return false } },
  async consumePendingActions() { if (!native()) return []; try { const result = await KfeRideNotifications.getPendingActions(); return Array.isArray(result?.events) ? result.events : [] } catch (_) { return [] } },
  async acknowledgeAction(eventId) { if (!native() || !eventId) return false; try { const result = await KfeRideNotifications.acknowledgeAction({ eventId }); return result?.acknowledged === true } catch (_) { return false } },
  async recordActionFailure(eventId, error) { if (!native() || !eventId) return false; try { await KfeRideNotifications.recordActionFailure({ eventId, error: String(error || "Processing failed") }); return true } catch (_) { return false } },
  async consumePendingAction() {
    if (!native()) return null
    try {
      const result = await KfeRideNotifications.getPendingAction(); const packed = String(result?.pending || '')
      if (!packed) return null
      const [stage = '', tripId = '', input = ''] = packed.split('|'); return { stage, tripId, input }
    } catch (_) { return null }
  },
  async clear() {
    state.tripId = null; state.phase = null; state.pickupDurationMinutes = null; state.rideDurationMinutes = null; persist(); return call('cancel')
  },
  addListener(event, handler) {
    if (!native()) return Promise.resolve({ remove: async () => {} })
    return KfeRideNotifications.addListener(event, handler)
  }
})