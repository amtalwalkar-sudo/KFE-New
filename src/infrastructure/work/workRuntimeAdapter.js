import { configureWorkRuntimePorts } from '../../application/work/workRuntimePorts.js'
import { NativeWorkActionsService } from '../android/nativeWorkActions.js'
import { NativeCanonicalWorkService } from '../android/nativeCanonicalWork.js'
import { AndroidOverlay } from '../android/kfeOverlay.js'
import { TripBoundaryLocationAdapter } from '../android/tripBoundaryLocationAdapter.js'
import { BrowserCanonicalWorkService } from './browserCanonicalWork.js'
import { GpsStatusAdapter } from '../android/gpsStatusAdapter.js'
import { DiagnosticService as InfrastructureDiagnosticService } from '../diagnostics/diagnosticService.js'
import { PlatformStartup } from '../startup/platformStartup.js'
import { LocalityResolutionAdapter } from '../location/localityResolutionAdapter.js'

export const installWorkRuntimeAdapter = () => configureWorkRuntimePorts({
  nativeWorkActions: NativeWorkActionsService,
  canonicalWork: NativeCanonicalWorkService,
  browserCanonicalWork: BrowserCanonicalWorkService,
  gpsPermissions: GpsStatusAdapter,
  diagnostics: InfrastructureDiagnosticService,
  androidOverlay: AndroidOverlay,
  platform: PlatformStartup,
  tripBoundaryLocation: TripBoundaryLocationAdapter,
  locationNames: LocalityResolutionAdapter,
})
