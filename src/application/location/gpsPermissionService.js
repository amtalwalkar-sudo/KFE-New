import { WorkRuntimePorts } from '../work/workRuntimePorts.js'

export const GpsPermissionService = Object.freeze({
  isNativePlatform() { return WorkRuntimePorts.gpsPermissions.isNativePlatform() },
  getStatus() { return WorkRuntimePorts.gpsPermissions.getLocationStatus() },
  openBackgroundSettings() { return WorkRuntimePorts.gpsPermissions.openBackgroundLocationSettings() },
  requestForegroundPermissions() { return WorkRuntimePorts.gpsPermissions.requestLocationPermissions() },
  requestBackgroundPermission() { return WorkRuntimePorts.gpsPermissions.requestBackgroundLocationPermission() },
})
