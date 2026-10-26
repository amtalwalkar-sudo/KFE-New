let LocalNotifications = null
let initialized = false
let activeTripStartedAt = null
let durationMinutes = null

const SHIFT_NOTIFICATION_ID = 7101
const DURATION_NOTIFICATION_ID = 7102
const DURATION_DELAY_MS = 2 * 60 * 1000
const CHANNEL_ID = 'kfe-trip-heads-up'

const loadPlugin = async () => { if (LocalNotifications) return LocalNotifications; try { const module = await import('@capacitor/local-notifications'); LocalNotifications = module.LocalNotifications; return LocalNotifications } catch (error) { console.warn('Native notifications unavailable; KFE screen remains the fallback.', error); return null } }
const parseDuration = value => { const match = String(value || '').trim().match(/^(?:([01]\d|2[0-3]):([0-5]\d))$/); if (!match) return null; const minutes = Number(match[1]) * 60 + Number(match[2]); return minutes > 0 ? minutes : null }
const formatDuration = minutes => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
const formatExpectedEnd = timestamp => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const cancelDurationNotification = async plugin => { try { await plugin.cancel({ notifications: [{ id: DURATION_NOTIFICATION_ID }] }) } catch (error) { console.warn('Unable to clear Trip duration notification.', error) } }
const scheduleDurationNotification = async (plugin, startedAt, minutes, at = new Date()) => { const expectedEnd = new Date(new Date(startedAt).getTime() + minutes * 60 * 1000); await cancelDurationNotification(plugin); await plugin.schedule({ notifications: [{ id: DURATION_NOTIFICATION_ID, title: minutes ? 'KFE — Trip Duration' : 'KFE — Enter Trip Duration', body: minutes ? `Duration ${formatDuration(minutes)} • Expected end ${formatExpectedEnd(expectedEnd.getTime())}` : 'Enter Trip duration as HH:MM', actionTypeId: minutes ? 'KFE_TRIP_DURATION_DONE' : 'KFE_TRIP_DURATION_INPUT', channelId: CHANNEL_ID, ongoing: true, autoCancel: false, schedule: { at, allowWhileIdle: true } }] }); return expectedEnd }
const requestDurationInput = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('kfe:trip-duration-input')) }

export const TripNotificationService = {
  async initialize(onAction) {
    if (initialized) return
    const plugin = await loadPlugin(); if (!plugin) return
    try {
      await plugin.requestPermissions()
      if (plugin.createChannel) await plugin.createChannel({ id: CHANNEL_ID, name: 'KFE Trip Heads-Up', description: 'Trip duration reminders', importance: 5, visibility: 1 })
      await plugin.registerActionTypes({ types: [{ id: 'KFE_TRIP_CONTROL', actions: [{ id: 'START_TRIP', title: 'START TRIP' }, { id: 'END_TRIP', title: 'END TRIP' }] }, { id: 'KFE_TRIP_DURATION_INPUT', actions: [{ id: 'SET_DURATION', title: 'ENTER DURATION' }] }, { id: 'KFE_TRIP_DURATION_DONE', actions: [{ id: 'DONE', title: 'DONE' }] }] })
      await plugin.addListener('localNotificationActionPerformed', async event => { const action = event?.actionId; if (action === 'START_TRIP' || action === 'END_TRIP') { void onAction(action); return } if (action === 'SET_DURATION') { if (activeTripStartedAt) requestDurationInput(); return } if (action === 'DONE') { durationMinutes = null; await cancelDurationNotification(plugin) } })
      initialized = true
    } catch (error) { console.warn('Trip notification setup failed; KFE screen remains the fallback.', error) }
  },
  async setDuration(value) { const plugin = await loadPlugin(); if (!plugin || !activeTripStartedAt) return false; const minutes = parseDuration(value); if (!minutes) return false; durationMinutes = minutes; await scheduleDurationNotification(plugin, activeTripStartedAt, minutes); return true },
  async showReady() { const plugin = await loadPlugin(); if (!plugin) return; activeTripStartedAt = null; durationMinutes = null; try { await cancelDurationNotification(plugin); await plugin.schedule({ notifications: [{ id: SHIFT_NOTIFICATION_ID, title: 'KFE — Shift Active', body: 'Ready for next trip', actionTypeId: 'KFE_TRIP_CONTROL', ongoing: true, autoCancel: false }] }) } catch (error) { console.warn('Unable to show Shift notification.', error) } },
  async showTripActive(startedAt) { const plugin = await loadPlugin(); if (!plugin) return; activeTripStartedAt = startedAt; durationMinutes = null; try { await cancelDurationNotification(plugin); await plugin.schedule({ notifications: [{ id: SHIFT_NOTIFICATION_ID, title: 'KFE — Trip Active', body: `Started ${new Date(startedAt).toLocaleTimeString()}`, actionTypeId: 'KFE_TRIP_CONTROL', ongoing: true, autoCancel: false }] }); const startedMs = new Date(startedAt).getTime(); const dueMs = Number.isFinite(startedMs) ? startedMs + DURATION_DELAY_MS : Date.now() + DURATION_DELAY_MS; await scheduleDurationNotification(plugin, startedAt, null, new Date(Math.max(Date.now(), dueMs))) } catch (error) { console.warn('Unable to show Trip notification.', error) } },
  async clear() {
    activeTripStartedAt = null
    durationMinutes = null

    void (async () => {
      try {
        const plugin = await Promise.race([
          loadPlugin(),
          new Promise(resolve => setTimeout(() => resolve(null), 1000))
        ])

        if (!plugin) return

        await Promise.race([
          plugin.cancel({
            notifications: [
              { id: SHIFT_NOTIFICATION_ID },
              { id: DURATION_NOTIFICATION_ID }
            ]
          }),
          new Promise(resolve => setTimeout(resolve, 1000))
        ])
      } catch (error) {
        console.warn('Unable to clear Trip notification.', error)
      }
    })()
  }
}
