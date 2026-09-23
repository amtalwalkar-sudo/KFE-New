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
  try {
    const targetResult = await DriverTargetService.getTarget(getKfeReferenceNow())
    if (Number.isFinite(Number(targetResult?.target))) {
      target = `₹${Number(targetResult.target).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    }
  } catch (_) {}

  try {
    const trips = await WorkService.getTripsForShift(active.shift.id)
    const rideTrips = trips.filter(item => item?.status === 'COMPLETED' || item?.status === 'ACTIVE')
    rides = String(rideTrips.length)
    const totalRevenue = rideTrips.reduce((sum, item) => {
      const value = Number(item?.revenue)
      return Number.isFinite(value) && value >= 0 ? sum + value : sum
    }, 0)
    revenue = `₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  } catch (_) {}

  if (active.trip?.id) {
    try {
      const distance = await WorkService.getTripGpsDistanceKm(active.trip.id)
      liveKm = `${Number.isFinite(Number(distance)) ? Number(distance).toFixed(1) : '0.0'} km`
    } catch (_) {}
  }

  let overlayAction = 'GO_TO_PICKUP'
  try {
    const notificationState = KfeRideNotificationService.getState()
    if (notificationState?.phase === 'START_RIDE') overlayAction = 'START_RIDE'
    if (notificationState?.phase === 'ENTER_PICKUP_DURATION') overlayAction = 'START_RIDE'
  } catch (_) {}
  if (active.trip?.id) overlayAction = 'END_RIDE'

  return { ...active, target, rides, revenue, liveKm, overlayAction, theme: document.documentElement?.dataset?.kfeTheme || 'light' }
}

const showOverlayIfNeeded = async () => {
  if (showing) return
  showing = true
  try {
    const permission = await AndroidOverlay.canDrawOverlays()
    if (!permission.granted) return
    const state = await activeOverlayState()
    if (state) await AndroidOverlay.show(state)
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
    if (!permission.granted) return
    const state = await activeOverlayState()
    if (state) await AndroidOverlay.update(state)
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