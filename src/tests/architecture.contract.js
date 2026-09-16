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
      for (const pattern of patterns) {
        if (pattern.test(source)) violations.push(`${label}: ${path.relative(root, file)} matches ${pattern}`)
      }
    }
  }
}

assertForbidden(
  ['views', 'components', 'stores', 'presentation'],
  [
    /from\s+['"][^'"]*\/repositories\//,
    /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/
  ],
  'Presentation/state must not access persistence directly'
)

assertForbidden(
  ['views', 'components', 'presentation'],
  [
    /from\s+['"][^'"]*\/domain\/performance\//,
    /from\s+['"][^'"]*\/domain\/work\//,
    /from\s+['"][^'"]*\/domain\/math\//
  ],
  'Presentation must not orchestrate domain logic directly'
)

assertForbidden(
  ['domain'],
  [
    /from\s+['"][^'"]*\/repositories\//,
    /from\s+['"][^'"]*\/utils\/indexedDB\.js['"]/
  ],
  'Domain must remain persistence-independent'
)

const legacyPaths = [
  'views/DashboardView.vue',
  'stores/workCycle.js',
  'stores/performanceStore.js',
  'stores/records.js',
  'stores/recordsStore.js',
  'usecases'
]
for (const relativePath of legacyPaths) {
  if (fs.existsSync(path.join(root, relativePath))) violations.push(`Legacy duplicate path still exists: ${relativePath}`)
}

const obsoleteAndroidPaths = [
  'android/app/src/main/java/com/kanishka/pwa/FloatingWidgetService.java',
  'android/app/src/main/res/layout/layout_floating_widget.xml'
]
for (const relativePath of obsoleteAndroidPaths) {
  if (fs.existsSync(path.join(projectRoot, relativePath))) violations.push(`Obsolete floating widget artifact still exists: ${relativePath}`)
}
const manifestPath = path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml')
if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8')
  if (/SYSTEM_ALERT_WINDOW|FloatingWidgetService/.test(manifest)) violations.push('Android manifest still grants or registers the obsolete floating widget overlay.')
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Architecture contract passed: presentation, state, domain, persistence and Android shell boundaries are clean.')
