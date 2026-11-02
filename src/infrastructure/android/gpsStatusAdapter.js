import { Capacitor, NativePlugins } from '../capacitor/nativePluginRegistry.js'

const NativeGps = NativePlugins.tripBoundaryLocation

export const GpsStatusAdapter = Object.freeze({
  isNativePlatform() { return Capacitor.isNativePlatform() },
  getLocationStatus() { return NativeGps.getLocationStatus() },
  openBackgroundLocationSettings() { return NativeGps.openBackgroundLocationSettings() },
  requestLocationPermissions() { return NativeGps.requestLocationPermissions() },
  requestBackgroundLocationPermission() { return NativeGps.requestBackgroundLocationPermission() },
})
