import { GpsStatusAdapter } from '../../infrastructure/android/gpsStatusAdapter.js'

export const GpsPermissionService = Object.freeze({
  isNativePlatform() { return GpsStatusAdapter.isNativePlatform() },
  getStatus() { return GpsStatusAdapter.getLocationStatus() },
  openBackgroundSettings() { return GpsStatusAdapter.openBackgroundLocationSettings() },
  requestForegroundPermissions() { return GpsStatusAdapter.requestLocationPermissions() },
  requestBackgroundPermission() { return GpsStatusAdapter.requestBackgroundLocationPermission() },
})
