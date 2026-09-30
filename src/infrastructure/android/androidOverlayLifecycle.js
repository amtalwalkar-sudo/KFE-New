import { AndroidOverlay } from './kfeOverlay.js'
import { WorkService } from '../../application/work/workService.js'
import { DriverTargetService } from '../../application/performance/driverTargetService.js'
import { getKfeReferenceNow } from '../../domain/time/ist.js'
import { PerformanceService } from '../../application/performance/performanceService.js'
import { KfeRideNotificationService } from './kfeRideNotificationService.js'
import { deriveWorkCockpitState } from '../../application/work/workCockpit.js'

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
  let targetProgress = 0
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
    const targetNumber = Number(String(target).replace(/[^0-9.]/g, ''))
    const achieved = trips
      .filter(item => item?.status === 'COMPLETED' && Number.isFinite(Number(item?.revenue)))
      .reduce((sum, item) => sum + Number(item.revenue), 0)
    if (Number.isFinite(targetNumber) && targetNumber > 0) {
      targetProgress = Math.min(100, Math.round((achieved / targetNumber) * 100))
    }

    const totalRevenue = trips.reduce((sum, item) => {
      const value = Number(item?.revenue)
      return Number.isFinite(value) && value >= 0 ? sum + value : sum
    }, 0)
    revenue = `₹${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  } catch (_) {}

  if (active.trip?.id) {
    try {
      const distance = await WorkService.getTripGpsDistanceKm(active.trip.id)
      if (Number.isFinite(Number(distance))) liveKm = `${Number(distance).toFixed(1)} km`
    } catch (_) {}
  }

  const pendingFareId = trips.find(item =>
    item?.status === 'COMPLETED' &&
    (item?.revenue === null || item?.revenue === undefined || item?.revenue === '')
  )?.id || ''

  const state = deriveWorkCockpitState({
    shift: active.shift,
    trip: active.trip,
    trips,
    pendingFareId,
    notificationPhase: KfeRideNotificationService.getState()?.phase || '',
    target,
    targetProgress,
    liveKm,
    revenue
  })

  return {
    ...active,
    target: state.target,
    targetProgress: state.targetProgress,
    rides: String(trips.length),
    liveKm: state.liveKm,
    revenue: state.revenue,
    tripStartAt: state.tripStartAt,
    overlayAction: state.action,
    overlayTripId: state.tripId,
    cancellationRevenue: '₹0',
    theme: document.documentElement?.dataset?.kfeTheme || 'light'
  }
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
    const activeElement = document.activeElement
    if (activeElement && typeof activeElement.blur === 'function') activeElement.blur()
    void showOverlayIfNeeded()
    startUpdates()
  }

  visibleHandler = () => {
    if (document.visibilityState !== 'visible') return
    hideOverlay()
  }

  blurHandler = () => {
    // Window blur is not the same as the app going to the background. In
    // particular, an application overlay can blur the WebView while the KFE
    // screen is still visible. Never show the native overlay from blur alone.
    const activeElement = document.activeElement
    if (activeElement && typeof activeElement.blur === 'function') activeElement.blur()
  }

  focusHandler = () => {
    hideOverlay()
  }

  document.addEventListener('visibilitychange', hiddenHandler)
  document.addEventListener('visibilitychange', visibleHandler)
  window.addEventListener('blur', blurHandler)
  window.addEventListener('focus', focusHandler)
}