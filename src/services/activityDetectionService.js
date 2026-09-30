export const movementDetectedFromDeviceMotion = (event) => {
  const acceleration = event?.accelerationIncludingGravity || event?.acceleration
  if (!acceleration) return false
  const x = Number(acceleration.x || 0)
  const y = Number(acceleration.y || 0)
  const z = Number(acceleration.z || 0)
  const magnitude = Math.sqrt(x * x + y * y + z * z)
  return Math.abs(magnitude - 9.81) > 1.2
}

let listener = null
let lastMotionAt = 0
let active = false

export const ActivityDetectionService = {
  start(onMovement) {
    this.stop()
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return false
    listener = (event) => {
      if (!movementDetectedFromDeviceMotion(event)) return
      const now = Date.now()
      if (now - lastMotionAt < 4000) return
      lastMotionAt = now
      onMovement?.({ detectedAt: new Date(now).toISOString(), source: 'device-motion' })
    }
    window.addEventListener('devicemotion', listener, { passive: true })
    active = true
    return true
  },
  stop() {
    if (listener && typeof window !== 'undefined') window.removeEventListener('devicemotion', listener)
    listener = null
    active = false
  },
  isActive() { return active }
}
