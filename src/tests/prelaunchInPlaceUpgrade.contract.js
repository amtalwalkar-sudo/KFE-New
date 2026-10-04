import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const buildGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8')
const indexedDb = fs.readFileSync(path.join(root, 'src', 'utils', 'indexedDB.js'), 'utf8')
const backup = fs.readFileSync(path.join(root, 'src', 'application', 'backup', 'backupService.js'), 'utf8')

assert(buildGradle.includes('applicationId "com.kanishka.pwa"'), 'Android package ID must remain stable for in-place upgrades.')
assert(buildGradle.includes('applicationIdSuffix ""'), 'Debug APK must not add a package suffix.')
assert(/versionCode\s+[4-9]\d*/.test(buildGradle), 'Android versionCode must advance beyond the previous release.')
assert(buildGradle.includes('versionName "2.1.0"'), 'Android release version must match the prelaunch release identity.')
assert(/const CANONICAL_DB_VERSION = (1[3-9]|[2-9]\d+)/.test(indexedDb), 'Canonical IndexedDB schema version must be versioned above the previous release.')
assert(indexedDb.includes('settings'), 'Settings persistence must remain part of the canonical storage schema.')
assert(backup.includes("const CANONICAL_BACKUP_STORES"), 'Canonical backup must include the current canonical store allowlist.')
assert(backup.includes("'settings'"), 'Upgrade-safe backup must preserve settings data.')
console.log('Prelaunch in-place upgrade contract: PASS')
