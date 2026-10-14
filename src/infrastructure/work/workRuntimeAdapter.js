import { Capacitor } from '@capacitor/core'
import { configureWorkRuntimePorts } from '../../application/work/workRuntimePorts.js'
import { MovementTraceService } from '../location/movementTraceService.js'
import { NativeGpsService } from '../android/nativeGpsService.js'
import { NativeWorkActionsService } from '../android/nativeWorkActions.js'
import { ValhallaRoutingAdapter } from '../location/valhallaRoutingAdapter.js'
import { AndroidOverlay } from '../android/kfeOverlay.js'

export const installWorkRuntimeAdapter = () => configureWorkRuntimePorts({
  movementTrace: MovementTraceService,
  nativeGps: NativeGpsService,
  nativeWorkActions: NativeWorkActionsService,
  androidOverlay: AndroidOverlay,
  routing: { createRouter: () => new ValhallaRoutingAdapter() },
  platform: { getPlatform: () => Capacitor.getPlatform() },
})
