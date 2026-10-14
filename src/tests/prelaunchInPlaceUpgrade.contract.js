import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const buildGradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8')
const indexedDb = fs.readFileSync(path.join(root, 'src', 'utils', 'indexedDB.js'), 'utf8') + fs.readFileSync(path.join(root, 'src', 'constants', 'canonicalDatabase.js'), 'utf8')
const backup = fs.readFileSync(path.join(root, 'src', 'application', 'backup', 'backupService.js'), 'utf8')
const androidCi = fs.readFileSync(path.join(root, '.github', 'workflows', 'consolidated-baseline.yml'), 'utf8')
const androidOnRequest = fs.readFileSync(path.join(root, '.github', 'workflows', 'android-apk-on-request.yml'), 'utf8')

assert(buildGradle.includes('applicationId "com.kanishka.pwa"'), 'Android package ID must remain stable for in-place upgrades.')
assert(buildGradle.includes('applicationIdSuffix ""'), 'Debug APK must not add a package suffix.')
assert(/versionCode\s+[4-9]\d*/.test(buildGradle), 'Android versionCode must advance beyond the previous release.')
assert(buildGradle.includes('versionName "2.1.1"'), 'Android release version must match the corrected prelaunch release identity.')
assert(/const CANONICAL_DB_VERSION = (1[3-9]|[2-9]\d+)/.test(indexedDb), 'Canonical IndexedDB schema version must be versioned above the previous release.')
assert(indexedDb.includes('settings') || backup.includes('settings'), 'Settings persistence must remain part of canonical persistence/backup.')
assert(backup.includes("const CANONICAL_BACKUP_STORES"), 'Canonical backup must include the current canonical store allowlist.')
assert(backup.includes("'settings'"), 'Upgrade-safe backup must preserve settings data.')

for (const secretName of [
  'KFE_ANDROID_KEYSTORE_BASE64',
  'KFE_ANDROID_KEYSTORE_PASSWORD',
  'KFE_ANDROID_KEY_ALIAS',
  'KFE_ANDROID_KEY_PASSWORD'
]) {
  assert(androidCi.includes(secretName), `Android CI must require persistent signing secret ${secretName}.`)
  assert(androidOnRequest.includes(secretName), `On-request APK workflow must require persistent signing secret ${secretName}.`)
}
assert(androidCi.includes('KFE_ANDROID_KEYSTORE_PATH: ${{ github.workspace }}/android/keystore/kfe-release.jks'), 'The CI APK build must receive the decoded persistent keystore path.')
assert(androidCi.includes('signer_certificate_sha256=$CERT_SHA256'), 'CI must record the certificate fingerprint extracted from the actual APK.')
assert(!androidCi.includes('echo "version_code=4"') && !androidCi.includes('echo "version_name=2.1.0"'), 'CI release identity must be read from the actual APK rather than hardcoded to an old version.')
assert(androidOnRequest.includes('signer_certificate_sha256=$CERT_SHA256'), 'The on-request APK workflow must record the certificate fingerprint extracted from the actual APK.')
console.log('Prelaunch in-place upgrade contract: PASS')
