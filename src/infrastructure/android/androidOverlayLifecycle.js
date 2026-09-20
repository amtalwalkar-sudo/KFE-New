import { AndroidOverlay } from './kfeOverlay.js'
import { WorkService } from '../../application/work/workService.js'

let configured = false
let hiddenHandler = null
let visibleHandler = null

const activeOverlayState = async () => {
  const active = await WorkService.getActiveState()
  if (!active?.shift?.id) return null
  return active
}

export const configureAndroidOverlayLifecycle = () => {
  if (configured || typeof document === 'undefined') return
  configured = true

  hiddenHandler = async () => {
    if (document.visibilityState !== 'hidden') return
    try {
      const permission = await AndroidOverlay.canDrawOverlays()
      if (!permission.granted) return
      const state = await activeOverlayState()
      if (state) await AndroidOverlay.show(state)
    } catch (error) {
      console.warn('KFE Android overlay unavailable:', error)
    }
  }

  visibleHandler = () => {
    if (document.visibilityState !== 'visible') return
    void AndroidOverlay.hide().catch(() => {})
  }

  document.addEventListener('visibilitychange', hiddenHandler)
  document.addEventListener('visibilitychange', visibleHandler)
}
