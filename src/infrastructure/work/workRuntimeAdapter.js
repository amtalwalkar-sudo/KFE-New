import { Capacitor } from '@capacitor/core'
import { configureWorkRuntimePorts } from '../../application/work/workRuntimePorts.js'
import { NativeWorkActionsService } from '../android/nativeWorkActions.js'
import { NativeCanonicalWorkService } from '../android/nativeCanonicalWork.js'
import { AndroidOverlay } from '../android/kfeOverlay.js'
import { TripBoundaryLocationAdapter } from '../android/tripBoundaryLocationAdapter.js'
import { BrowserCanonicalWorkService } from './browserCanonicalWork.js'
import { GpsStatusAdapter } from '../android/gpsStatusAdapter.js'

export const installWorkRuntimeAdapter = () => configureWorkRuntimePorts({
  nativeWorkActions: NativeWorkActionsService,
  canonicalWork: NativeCanonicalWorkService,
  browserCanonicalWork: BrowserCanonicalWorkService,
  gpsPermissions: GpsStatusAdapter,
  androidOverlay: AndroidOverlay,
  platform: { getPlatform: () => Capacitor.getPlatform() },
  tripBoundaryLocation: TripBoundaryLocationAdapter,
})
