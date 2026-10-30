import { Capacitor } from '@capacitor/core'
import { configureWorkRuntimePorts } from '../../application/work/workRuntimePorts.js'
import { NativeWorkActionsService } from '../android/nativeWorkActions.js'
import { NativeCanonicalWorkService } from '../android/nativeCanonicalWork.js'
import { AndroidOverlay } from '../android/kfeOverlay.js'
import { TripBoundaryLocationAdapter } from '../android/tripBoundaryLocationAdapter.js'

export const installWorkRuntimeAdapter = () => configureWorkRuntimePorts({
  nativeWorkActions: NativeWorkActionsService,
  canonicalWork: NativeCanonicalWorkService,
  androidOverlay: AndroidOverlay,
  platform: { getPlatform: () => Capacitor.getPlatform() },
  tripBoundaryLocation: TripBoundaryLocationAdapter,
})
