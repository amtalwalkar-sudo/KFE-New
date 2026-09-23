import { AndroidOverlay } from './kfeOverlay.js'
import { WorkService } from '../../application/work/workService.js'

let configured = false
let hiddenHandler = null
let visibleHandler = null
let blurHandler = null
let focusHandler = null
let showing = false

const activeOverlayState = async () => {
  const active = await WorkService.getActiveState()
  if (!active?.shift?.id) return null
  return active
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

const hideOverlay = () => {
  void AndroidOverlay.hide().catch(() => {})
}

export const configureAndroidOverlayLifecycle = () => {
  if (configured || typeof document === 'undefined') return
  configured = true

  hiddenHandler = () => {
    if (document.visibilityState !== 'hidden') return
    void showOverlayIfNeeded()
  }

  visibleHandler = () => {
    if (document.visibilityState !== 'visible') return
    hideOverlay()
  }

  // Capacitor Android WebViews do not consistently deliver the browser
  // visibility transition before the Activity loses focus. Starting the
  // overlay on blur also keeps the native FGS launch within the user-visible
  // transition, which is required on newer Android releases.
  blurHandler = () => {
    void showOverlayIfNeeded()
  }

  focusHandler = () => {
    hideOverlay()
  }

  document.addEventListener('visibilitychange', hiddenHandler)
  document.addEventListener('visibilitychange', visibleHandler)
  window.addEventListener('blur', blurHandler)
  window.addEventListener('focus', focusHandler)
}
