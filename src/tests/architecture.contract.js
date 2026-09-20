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

assertForbidden(['views', 'components', 'stores', 'presentation'], [ /from\s+['"][^'"]*\/repositories\//, /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/ ], 'Presentation/state must not access persistence directly')
assertForbidden(['views', 'components', 'presentation'], [ /from\s+['"][^'"]*\/domain\/performance\//, /from\s+['"][^'"]*\/domain\/work\//, /from\s+['"][^'"]*\/domain\/math\//, /from\s+['"][^'"]*\/domain\/movement\// ], 'Presentation must not orchestrate domain logic directly')
assertForbidden(['domain'], [ /from\s+['"][^'"]*\/repositories\//, /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/, /from\s+['"][^'"]*\/application\//, /from\s+['"][^'"]*\/infrastructure\//, /from\s+['"][^'"]*\/presentation\// ], 'Domain must remain independent of outer layers')
assertForbidden(['application'], [ /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/ ], 'Application must not depend directly on raw IndexedDB')
assertForbidden(['views', 'components', 'presentation', 'application', 'infrastructure'], [ /from\s+['"][^'"]*\/services\// ], 'Canonical runtime must not depend on legacy src/services')
assertForbidden(['views', 'components', 'presentation', 'application'], [ /['"][^'"]*\bjs\/app\.js['"]/ ], 'Current architecture must not reference removed legacy js application')

const appPath = path.join(root, 'App.vue')
if (fs.existsSync(appPath)) {
  const app = fs.readFileSync(appPath, 'utf8')
  if (/ShellService|BackupService|CloudBackupLifecycle|initializeCanonicalStorage|indexedDB|serviceWorker/i.test(app)) violations.push('App.vue still owns application/infrastructure startup concerns.')
}

const legacyPaths = ['views/DashboardView.vue','stores/workCycle.js','stores/performanceStore.js','stores/records.js','stores/recordsStore.js','stores/offlineQueue.js','stores/offlineQueueStore.js','stores/index.js','services/syncEngine.js','usecases']
for (const relativePath of legacyPaths) if (fs.existsSync(path.join(root, relativePath))) violations.push(`Legacy duplicate path still exists: ${relativePath}`)

const obsoleteAndroidPaths = ['android/app/src/main/java/com/kanishka/pwa/FloatingWidgetService.java','android/app/src/main/res/layout/layout_floating_widget.xml']
for (const relativePath of obsoleteAndroidPaths) if (fs.existsSync(path.join(projectRoot, relativePath))) violations.push(`Obsolete floating widget artifact still exists: ${relativePath}`)
const manifestPath = path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml')
if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8')
  if (/FloatingWidgetService/.test(manifest)) violations.push('Android manifest still registers the obsolete floating widget overlay.')
}

const legacyServiceAllowlist = ['activityDetectionService.js','interShiftOdometerGapService.js','locationNameService.js','locationService.js','odometerAuditService.js','rideCaptureService.js','shiftValidator.js','syncService.js','tripNotificationService.js','adapters/apiAdapter.js','adapters/rideCaptureAdapter.js']
for (const relativePath of legacyServiceAllowlist) if (fs.existsSync(path.join(root, 'services', relativePath))) {
  const source = fs.readFileSync(path.join(root, 'services', relativePath), 'utf8')
  if (/from\s+['"][^'"]*\/usecases\//.test(source)) violations.push(`Legacy service still references removed usecases: ${relativePath}`)
}

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
]
for (const relativePath of obsoleteFiles) if (fs.existsSync(path.join(root, relativePath))) violations.push(`Obsolete implementation still exists: ${relativePath}`)

if (violations.length) { console.error(violations.join('\n')); process.exit(1) }
console.log('Architecture contract passed: presentation, application, domain, persistence, infrastructure and obsolete-code boundaries are clean.')
