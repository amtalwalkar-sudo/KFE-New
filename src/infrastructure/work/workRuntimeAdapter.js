import { configureWorkRuntimePorts } from '../../application/work/workRuntimePorts.js'
import { MovementTraceService } from '../location/movementTraceService.js'
import { NativeGpsService } from '../android/nativeGpsService.js'
import { KfeRideNotificationService } from '../android/kfeRideNotificationService.js'
import { AndroidOverlay } from '../android/kfeOverlay.js'

export const installWorkRuntimeAdapter = () => configureWorkRuntimePorts({
  movementTrace: MovementTraceService,
  nativeGps: NativeGpsService,
  rideNotifications: KfeRideNotificationService,
  androidOverlay: AndroidOverlay,
})
