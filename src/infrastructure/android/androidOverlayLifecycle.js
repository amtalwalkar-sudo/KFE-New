import { AndroidOverlay } from './kfeOverlay.js'
import { WorkService } from '../../application/work/workService.js'
import { deriveWorkCockpitState } from '../../application/work/workCockpit.js'

let configured = false
let hiddenHandler = null
let visibleHandler = null
let blurHandler = null
let focusHandler = null
let showing = false
let updateTimer = null

const activeOverlayState = async () => {
  const active = await WorkService.getActiveState()
  if (!active?.shift?.id) return null

  let revenue = '₹0'
  let trips = []

  try {
    trips = await WorkService.getTripsForShift(active.shift.id)
  } catch (_) {}

  // Trip fares are optional detail. Overlay revenue must mirror the
  // authoritative shift-end revenue, never a sum of trip-level fares.
  const authoritativeRevenue = Number(active.shift?.revenue)
  if (Number.isFinite(authoritativeRevenue) && authoritativeRevenue >= 0) {
    revenue = `₹${authoritativeRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  const pendingFareId = trips
    .filter(item => item?.status === 'COMPLETED' && item?.fareDetailsSkipped !== true &&
      (item?.revenue === null || item?.revenue === undefined || item?.revenue === ''))
    .sort((a, b) => Date.parse(b.tripEndAt || b.updatedAt || '') - Date.parse(a.tripEndAt || a.updatedAt || ''))[0]?.id || ''

  const state = deriveWorkCockpitState({
    shift: active.shift,
    trip: active.trip,
    trips,
    pendingFareId,
    revenue
  })

  return {
    ...active,
    rides: String(trips.length),
    revenue: state.revenue,
    tripStartAt: state.tripStartAt,
    // A completed trip awaiting fare takes precedence over the idle
    // GO_TO_PICKUP action, exactly as it does in the foreground Work view.
    overlayAction: state.pendingFareId && (!active.trip?.id || active.trip.status !== 'ACTIVE') ? 'ENTER_FARE' : state.action,
    overlayTripId: state.pendingFareId && (!active.trip?.id || active.trip.status !== 'ACTIVE') ? state.pendingFareId : state.tripId,
    pendingFareId: state.pendingFareId,
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

const collapseOverlayToBubble = () => {
  void AndroidOverlay.minimize().catch(() => {})
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
    stopUpdates()
    collapseOverlayToBubble()
  }

  blurHandler = () => {
    // Window blur is not the same as the app going to the background. In
    // particular, an application overlay can blur the WebView while the KFE
    // screen is still visible. Never show the native overlay from blur alone.
    const activeElement = document.activeElement
    if (activeElement && typeof activeElement.blur === 'function') activeElement.blur()
  }

  focusHandler = () => {
    collapseOverlayToBubble()
  }

  document.addEventListener('visibilitychange', hiddenHandler)
  document.addEventListener('visibilitychange', visibleHandler)
  window.addEventListener('blur', blurHandler)
  window.addEventListener('focus', focusHandler)
}