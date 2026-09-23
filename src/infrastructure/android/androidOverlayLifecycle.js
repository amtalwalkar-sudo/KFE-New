import { AndroidOverlay } from './kfeOverlay.js'
import { WorkService } from '../../application/work/workService.js'
import { DriverTargetService } from '../../application/performance/driverTargetService.js'
import { getKfeReferenceNow } from '../../domain/time/ist.js'
import { KfeRideNotificationService } from './kfeRideNotificationService.js'

let configured = false
let hiddenHandler = null
let visibleHandler = null
let blurHandler = null
let focusHandler = null
let showing = false
let updateTimer = null

const activeOverlayState = async () => {
  KfeRideNotificationService.restore()
  const active = await WorkService.getActiveState()
  if (!active?.shift?.id) return null

  let target = '—'
  let rides = '0'
  let liveKm = '0.0 km'
  let revenue = '₹0'
  let trips = []
  try {
    const targetResult = await DriverTargetService.getTarget(getKfeReferenceNow())
    if (Number.isFinite(Number(targetResult?.target))) {
      target = `₹${Number(targetResult.target).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    }
  } catch (_) {}

  try {
    trips = await WorkService.getTripsForShift(active.shift.id)
    const rideTrips = trips.filter(item => item?.status === 'COMPLETED' || item?.status === 'ACTIVE')
    rides = String(rideTrips.length)
  } catch (_) {}
  const authoritativeRevenue = Number(active.shift?.revenue)
  revenue = `₹${Number.isFinite(authoritativeRevenue) && authoritativeRevenue >= 0 ? authoritativeRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0'}`

  if (active.trip?.id) {
    try {
      const distance = await WorkService.getTripGpsDistanceKm(active.trip.id)
      liveKm = `${Number.isFinite(Number(distance)) ? Number(distance).toFixed(1) : '0.0'} km`
    } catch (_) {}
  }

  let overlayAction = 'GO_TO_PICKUP'
  let overlayTripId = ''
  try {
    const notificationState = KfeRideNotificationService.getState()
    if (notificationState?.phase === 'START_RIDE') overlayAction = 'START_RIDE'
    if (notificationState?.phase === 'ENTER_PICKUP_DURATION') overlayAction = 'START_RIDE'
  } catch (_) {}
  if (active.trip?.id) { overlayAction = 'END_RIDE'; overlayTripId = active.trip.id }
  else {
    // A completed trip with no fare is a pending supporting-detail entry. The main app
    // owns persistence; the overlay only mirrors this state and sends the user's fare back.
    const unpriced = trips.filter(item => item?.status === 'COMPLETED' && (item?.revenue === null || item?.revenue === undefined || item?.revenue === '')).sort((a,b) => new Date(b.tripEndAt || b.updatedAt) - new Date(a.tripEndAt || a.updatedAt))
    if (unpriced[0]?.id) { overlayAction = 'ENTER_FARE'; overlayTripId = unpriced[0].id }
  }

  return { ...active, target, rides, revenue, liveKm, overlayAction, overlayTripId, theme: document.documentElement?.dataset?.kfeTheme || 'light' }
}

const showOverlayIfNeeded = async () => {
  if (showing) return
  showing = true
  try {
    const permission = await AndroidOverlay.canDrawOverlays()
    if (!permission.granted) { await AndroidOverlay.hide(); return }
    const state = await activeOverlayState()
    if (state) await AndroidOverlay.show(state)
    else await AndroidOverlay.hide()
  } catch (error) {
    console.warn('KFE Android overlay unavailable:', error)
  } finally {
    showing = false
  }
}

const updateOverlayIfNeeded = async () => {
  if (document.visibilityState === 'visible') return
  try {
    const permission = await AndroidOverlay.canDrawOverlays()
    if (!permission.granted) { await AndroidOverlay.hide(); return }
    const state = await activeOverlayState()
    if (state) await AndroidOverlay.update(state)
    else await AndroidOverlay.hide()
  } catch (_) {}
}

const startUpdates = () => {
  if (updateTimer !== null) return
  updateTimer = window.setInterval(() => { void updateOverlayIfNeeded() }, 2000)
}

const stopUpdates = () => {
  if (updateTimer !== null) window.clearInterval(updateTimer)
  updateTimer = null
}

const hideOverlay = () => {
  stopUpdates()
  void AndroidOverlay.hide().catch(() => {})
}

export const configureAndroidOverlayLifecycle = () => {
  if (configured || typeof document === 'undefined') return
  configured = true

  hiddenHandler = () => {
    if (document.visibilityState !== 'hidden') return
    void showOverlayIfNeeded()
    startUpdates()
  }

  visibleHandler = () => {
    if (document.visibilityState !== 'visible') return
    hideOverlay()
  }

  blurHandler = () => {
    void showOverlayIfNeeded()
    startUpdates()
  }

  focusHandler = () => {
    hideOverlay()
  }

  document.addEventListener('visibilitychange', hiddenHandler)
  document.addEventListener('visibilitychange', visibleHandler)
  window.addEventListener('blur', blurHandler)
  window.addEventListener('focus', focusHandler)
}