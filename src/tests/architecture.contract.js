import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectRoot = path.resolve(root, '..')
const readFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const target = path.join(dir, entry.name)
  if (entry.isDirectory()) return readFiles(target)
  return /\.(js|vue)$/.test(entry.name) ? [target] : []
})

const violations = []
const assertForbidden = (dirs, patterns, label) => {
  for (const dir of dirs) {
    for (const file of readFiles(path.join(root, dir))) {
      const source = fs.readFileSync(file, 'utf8')
      for (const pattern of patterns) if (pattern.test(source)) violations.push(`${label}: ${path.relative(root, file)} matches ${pattern}`)
    }
  }
}

assertForbidden(['views', 'components', 'stores', 'presentation', 'router'], [ /from\s+['"][^'"]*\/repositories\//, /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/, /from\s+['"][^'"]*\/infrastructure\//, /from\s+['"]@capacitor\// ], 'Presentation/state must not access persistence or infrastructure directly')
assertForbidden(['views', 'components', 'presentation'], [ /from\s+['"][^'"]*\/domain\/(?:performance|work|math|movement|time)\// ], 'Presentation must not orchestrate domain logic directly')

const workViewPath = path.join(root, 'views/WorkModuleView.vue')
if (fs.existsSync(workViewPath)) {
  const workView = fs.readFileSync(workViewPath, 'utf8')
  if (/from\s+['"][^'"]*\/infrastructure\//.test(workView)) violations.push('WorkModuleView.vue must use application runtime ports instead of importing infrastructure adapters directly.')
}
const workServicePath = path.join(root, 'application/work/workService.js')
if (fs.existsSync(workServicePath)) {
  const workService = fs.readFileSync(workServicePath, 'utf8')
  if (/from\s+['"][^'"]*\/infrastructure\//.test(workService)) violations.push('WorkService must use application runtime ports instead of importing infrastructure adapters directly.')
}

const workflowUiStatePath = path.join(root, 'presentation/workflowUiState.js')
if (!fs.existsSync(workflowUiStatePath)) violations.push('Work timer/session restoration must live in the presentation UI-state owner.')
const workViewSource = fs.readFileSync(workViewPath, 'utf8')
if (!workViewSource.includes("../presentation/workflowUiState.js")) violations.push('Work view must consume presentation-owned workflow UI state.')
if (fs.existsSync(path.join(root, 'application/work/workflowTimerService.js'))) violations.push('Application must not own browser-backed Work UI session state.')

assertForbidden(['domain'], [ /from\s+['"][^'"]*\/repositories\//, /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/, /from\s+['"][^'"]*\/application\//, /from\s+['"][^'"]*\/infrastructure\//, /from\s+['"][^'"]*\/presentation\// ], 'Domain must remain independent of outer layers')
assertForbidden(['application'], [ /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/, /from\s+['"][^'"]*\/presentation\//, /from\s+['"][^'"]*\/infrastructure\//, /from\s+['"]@capacitor\//, /from\s+['"]vue['"]/, /from\s+['"]pinia['"]/, /from\s+['"]@vue\// ], 'Application must not depend on raw persistence, presentation, infrastructure, Capacitor plugins, or UI frameworks')
assertForbidden(['application'], [ /\bfetch\s*\(/, /navigator\.geolocation/ ], 'Application must not own network requests or platform location acquisition')
assertForbidden(['application'], [ /\b(?:window|document|navigator|localStorage|sessionStorage|indexedDB)\s*(?:\.|\[)/ ], 'Application must use runtime ports instead of browser globals')

assertForbidden(['views', 'components', 'presentation', 'application', 'infrastructure'], [ /from\s+['"][^'"]*\/services\// ], 'Canonical runtime must not depend on legacy src/services')
assertForbidden(['views', 'components', 'presentation', 'application'], [ /['"][^'"]*\bjs\/app\.js['"]/ ], 'Current architecture must not reference removed legacy js application')

const adminViewForShell = fs.readFileSync(path.join(root, 'views/AdminView.vue'), 'utf8')
if (/querySelector\(\s*['\"]\.content-scroll-area/.test(adminViewForShell)) violations.push('AdminView must emit shell viewport intent instead of querying shell DOM internals.')

const appPath = path.join(root, 'App.vue')
if (fs.existsSync(appPath)) {
  const app = fs.readFileSync(appPath, 'utf8')
  if (/<style\b|\sstyle\s*=/.test(app)) violations.push('App.vue must use shared presentation styles rather than inline styling.')
  if (/ShellService|BackupService|CloudBackupLifecycle|initializeCanonicalStorage|indexedDB|serviceWorker/i.test(app)) violations.push('App.vue still owns application/infrastructure startup concerns.')
if (!app.includes("from './presentation/startup/useStartupUiState.js'")) violations.push('App.vue must consume startup and permission state through presentation-owned reactive state.')
}

const legacyPaths = ['views/DashboardView.vue','presentation/shell','stores/workCycle.js','stores/performanceStore.js','stores/records.js','stores/recordsStore.js','stores/offlineQueue.js','stores/offlineQueueStore.js','stores/index.js','services/syncEngine.js','usecases','composables/useForm.js','composables/useRecordForm.js','composables/useToast.js','layouts/FormLayout.vue','views/AdminSettingsOnlyView.vue','views/BlankWorkspaceView.vue','components/VehicleModuleView.vue','components/ComplianceModuleView.vue','components/MaintenanceModuleView.vue']
for (const relativePath of legacyPaths) if (fs.existsSync(path.join(root, relativePath))) violations.push(`Legacy duplicate path still exists: ${relativePath}`)

const obsoleteAndroidPaths = ['android/app/src/main/java/com/kanishka/pwa/FloatingWidgetService.java','android/app/src/main/res/layout/layout_floating_widget.xml']
for (const relativePath of obsoleteAndroidPaths) if (fs.existsSync(path.join(projectRoot, relativePath))) violations.push(`Obsolete floating widget artifact still exists: ${relativePath}`)
const manifestPath = path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml')
if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8')
  if (/FloatingWidgetService/.test(manifest)) violations.push('Android manifest still registers the obsolete floating widget overlay.')
}

if (fs.existsSync(path.join(root, 'services'))) violations.push('Obsolete src/services layer must remain deleted; active services belong to application or infrastructure owners.')

const obsoleteFiles = [
  'stores/offlineQueueStore.js',
  'stores/index.js',
  'services/syncEngine.js',
  'services/api.js',
  'services/movementTraceService.js',
  'services/valhallaRoutingAdapter.js',
  'services/kfeRideNotificationService.js',
  'services/kfeThemeController.js',
  'services/diagnosticService.js',
  'services/operationalRecordService.js',
  'services/deadKmPickupGpsService.js',
  'application/shell/shellService.js',
  'presentation/application/presentation-api.js',
  'services/movementAccountingService.js',
  'services/mileageAccountingService.js',
  'services/revenueReconciliationService.js',
  'repositories/odoGapRepository.js',
  'application/platform/kfeNativeContract.js',
  'application/diagnostics/diagnosticService.js',
  'infrastructure/diagnostics/diagnosticService.js',
]
for (const relativePath of obsoleteFiles) if (fs.existsSync(path.join(root, relativePath))) violations.push(`Obsolete implementation still exists: ${relativePath}`)


// Native Capacitor plugin registration is centralized. Capability adapters may
// consume registry exports, but must not create independent plugin instances.
const infrastructureRoot = path.join(root, 'infrastructure')
for (const file of readFiles(infrastructureRoot)) {
  const relativePath = path.relative(infrastructureRoot, file).split(path.sep).join('/')
  if (relativePath === 'capacitor/nativePluginRegistry.js') continue
  const source = fs.readFileSync(file, 'utf8')
  if (/\bregisterPlugin\s*\(/.test(source) || /from\s+['"]@capacitor\/core['"]/.test(source)) {
    violations.push(`Native Capacitor access must use the shared registry: infrastructure/${relativePath}`)
  }
}
const pluginRegistryPath = path.join(infrastructureRoot, 'capacitor/nativePluginRegistry.js')
const registry = fs.existsSync(pluginRegistryPath) ? fs.readFileSync(pluginRegistryPath, 'utf8') : ''
if (!fs.existsSync(pluginRegistryPath)) {
  violations.push('Shared Capacitor native plugin registry is missing.')
} else {
  for (const pluginName of ['KfeNativeWorkActions', 'KfeCanonicalWork', 'KfeOverlay', 'KfeTripBoundaryLocation', 'KfeSecureStorage', 'KfeBackupFile', 'KfeNativeSystem']) {
    if (!registry.includes(`registerPlugin('${pluginName}')`)) violations.push(`Shared Capacitor registry is missing ${pluginName}.`)
  }
}


const layerRegistry = JSON.parse(fs.readFileSync(path.join(projectRoot, 'spec/architecture/layers.json'), 'utf8'))
if ((layerRegistry.allowedImports.application || []).includes('infrastructure')) {
  violations.push('Application may depend only on domain, repository boundaries and application-owned ports—not infrastructure implementations.')
}
if (!(layerRegistry.allowedImports.infrastructure || []).includes('application')) {
  violations.push('Infrastructure must be allowed to implement application-owned runtime ports at the composition boundary.')
}
const mainActivityPath = path.join(projectRoot, 'android/app/src/main/java/com/kanishka/pwa/MainActivity.java')
const mainActivity = fs.readFileSync(mainActivityPath, 'utf8')
const registeredJsPlugins = [...registry.matchAll(/registerPlugin\('([^']+)'\)/g)].map(match => match[1]).sort()
const registeredNativePlugins = [...mainActivity.matchAll(/registerPlugin\((Kfe[A-Za-z0-9]+)\.class\)/g)].map(match => match[1].replace(/Plugin$/, '')).sort()
const expectedNativePlugins = ['KfeNativeWorkActions','KfeCanonicalWork','KfeOverlay','KfeTripBoundaryLocation','KfeSecureStorage','KfeBackupFile','KfeNativeSystem'].sort()
if (registeredJsPlugins.length !== expectedNativePlugins.length || registeredJsPlugins.some((name,index) => name !== expectedNativePlugins[index])) {
  violations.push('JavaScript Capacitor plugin registry must contain exactly the seven active native capabilities.')
}
if (registeredNativePlugins.length !== expectedNativePlugins.length || registeredNativePlugins.some((name,index) => name !== expectedNativePlugins[index])) {
  violations.push('MainActivity must register exactly the native counterparts of the seven JavaScript plugin capabilities.')
}
const mainPath = path.join(root, 'main.js')
const mainSource = fs.readFileSync(mainPath, 'utf8')
if (/document\.createElement|style\.cssText/.test(mainSource)) violations.push('main.js must dispatch runtime errors to the App shell, not build presentation DOM.')
const runtimePortsPath = path.join(root, 'application/work/workRuntimePorts.js')
const runtimeAdapterPath = path.join(root, 'infrastructure/work/workRuntimeAdapter.js')
const runtimePorts = fs.readFileSync(runtimePortsPath, 'utf8')
const runtimeAdapter = fs.readFileSync(runtimeAdapterPath, 'utf8')
if (!(mainSource.indexOf('installWorkRuntimeAdapter()') >= 0 && mainSource.indexOf('installWorkRuntimeAdapter()') < mainSource.indexOf('createKfeRouter('))) {
  violations.push('The single composition root must install runtime ports before router creation.')
}
if (!mainSource.includes("import('./presentation/forms/universalFormSystem.js')")) violations.push('The shared form system must be initialized explicitly by the composition root.')
if (!runtimeAdapter.includes('configureWorkRuntimePorts(') || !runtimePorts.includes('export const configureWorkRuntimePorts')) {
  violations.push('Application-owned runtime ports must have one infrastructure adapter binding.')
}
if (!mainSource.includes("from './infrastructure/work/workRuntimeAdapter.js'")) violations.push('main.js must be the single infrastructure composition root.')
for (const relativePath of [
  'views/FirstRunSetupView.vue',
  'application/setup/firstRunSetupService.js',
  'application/work/workDraftService.js',
  'domain/work/shiftStartRuleInterpreter.js',
]) if (fs.existsSync(path.join(root, relativePath))) violations.push(`Retired duplicate/overbuilt path still exists: ${relativePath}`)
if (fs.existsSync(path.join(projectRoot, 'spec/work-domain/shift-start-rules.json'))) violations.push('The retired generic odometer-rule AST must not return.')
const workViewForScope = fs.readFileSync(path.join(root, 'views/WorkModuleView.vue'), 'utf8')
const workServiceForScope = fs.readFileSync(path.join(root, 'application/work/workService.js'), 'utf8')
if (/Personal KM|Dead KM|gapChoice|gap allocation/i.test(workViewForScope)) violations.push('Work view still contains retired odometer-gap classification.')
if (/validateGapAllocation|movementReconciliation|reconcileShiftRevenue|normalized\\.tripKm/.test(workServiceForScope)) violations.push('WorkService still contains retired movement/reconciliation behavior.')

if (violations.length) { console.error(violations.join('\n')); process.exit(1) }
console.log('Architecture contract passed: presentation, application, domain, persistence, infrastructure and obsolete-code boundaries are clean.')
