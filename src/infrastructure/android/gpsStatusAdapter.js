import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeGps = registerPlugin('KfeTripBoundaryLocation')

export const GpsStatusAdapter = Object.freeze({
  isNativePlatform() { return Capacitor.isNativePlatform() },
  getLocationStatus() { return NativeGps.getLocationStatus() },
  openBackgroundLocationSettings() { return NativeGps.openBackgroundLocationSettings() },
  requestLocationPermissions() { return NativeGps.requestLocationPermissions() },
  requestBackgroundLocationPermission() { return NativeGps.requestBackgroundLocationPermission() },
})
