#!/usr/bin/env node
/**
 * Pre-change guard for KFE presentation edits.
 * Run before editing. Shared CSS/theme/shell/native surfaces require an
 * explicit impact acknowledgement; business/persistence layers are never
 * accepted as presentation-only targets.
 */
import process from 'node:process'

const args = process.argv.slice(2)
const acknowledge = args.includes('--acknowledge-shared-impact')
const acknowledgeNative = args.includes('--acknowledge-native-impact')
const requested = args.filter((arg) => !arg.startsWith('--')).map((p) => p.replaceAll('\\', '/').replace(/^\.\//, ''))

if (!requested.length) {
  console.error('Usage: npm run ui:preflight -- <path> [path ...] [--acknowledge-shared-impact]')
  console.error('Run before editing. Shared-surface acknowledgement is not a substitute for reviewing the listed impact.')
  process.exit(2)
}

const protectedPrefixes = [
  'src/domain/', 'src/application/', 'src/repositories/', 'src/infrastructure/',
  'src/utils/indexedDB.js'
]
const sharedPrefixes = [
  'src/styles/', 'src/assets/styles/', 'src/components/shell/',
  'src/components/ui/', 'src/presentation/theme', 'src/composables/useTheme'
]
const isUnder = (file, prefix) => file === prefix || file.startsWith(prefix)
const protectedFiles = requested.filter((file) => protectedPrefixes.some((prefix) => isUnder(file, prefix)))
const nativeFiles = requested.filter((file) => isUnder(file, 'android/') || isUnder(file, 'capacitor.config.'))
const sharedFiles = requested.filter((file) => sharedPrefixes.some((prefix) => isUnder(file, prefix)))

console.log('KFE UI CHANGE PREFLIGHT')
for (const file of requested) console.log(`Requested: ${file}`)

if (protectedFiles.length) {
  console.error('\n🔴 CHANGE IMPACT WARNING — protected business or persistence authority is in scope:')
  for (const file of protectedFiles) console.error(`  - ${file}`)
  console.error('Stop. This is not a presentation-only change. Separate it or explicitly redesign the cross-layer contract.')
  process.exit(1)
}

if (nativeFiles.length && !acknowledgeNative) {
  console.error('\n🔴 CHANGE IMPACT WARNING — native implementation authority is in scope:')
  for (const file of nativeFiles) console.error(`  - ${file}`)
  console.error('This is a cross-layer native change. Review the native/lifecycle/data contract impact, then rerun with --acknowledge-native-impact.')
  process.exit(1)
}

if (nativeFiles.length && acknowledgeNative) {
  console.log('\n🟡 NATIVE IMPACT ACKNOWLEDGED — native implementation changes require cross-surface lifecycle, Android, and exact-APK verification.')
}

if (sharedFiles.length) {
  console.log('\n🔴 CHANGE IMPACT WARNING — shared presentation surface may affect multiple screens or native behavior:')
  for (const file of sharedFiles) console.log(`  - ${file}`)
  console.log('Required review: enumerate consumers, check Light/Dark/Auto, all four routes, viewport/keyboard, overlays, and relevant visual/E2E tests.')
  if (!acknowledge) {
    console.error('\nBLOCKED before edit. After reviewing the impact list, rerun with --acknowledge-shared-impact to record an explicit decision.')
    process.exit(1)
  }
  console.log('\n🟡 ACKNOWLEDGED — proceed only with the stated cross-surface verification; this is not proof of isolation.')
} else {
  console.log('\n🟢 LOCAL CANDIDATE — no protected/shared path was explicitly requested.')
  console.log('Still run npm run ui:impact -- <same paths>; import analysis alone does not prove CSS/runtime isolation.')
}
