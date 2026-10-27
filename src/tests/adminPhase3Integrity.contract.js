import assert from 'node:assert/strict'
import fs from 'node:fs'

const adminRepository = fs.readFileSync('src/repositories/adminRepository.js', 'utf8')
const backupRepository = fs.readFileSync('src/repositories/backupRepository.js', 'utf8')
const backupService = fs.readFileSync('src/application/backup/backupService.js', 'utf8')

const saveSource = adminRepository.slice(adminRepository.indexOf('async save(formKey'), adminRepository.indexOf('async correctLoan'))
assert.match(saveSource, /const stores = new Set\(\[storeName, 'pending_mutations', 'audit_history'\]\)/,
  'Admin saves must explicitly assemble a single canonical transaction for business and audit writes')
assert.match(saveSource, /if \(formKey === 'settlement' \|\| formKey === 'maintenance' \|\| formKey === 'compliance'\) stores\.add\('settlements'\)/,
  'Settlement creation and source amount edits must serialize against linked settlement changes')
assert.match(saveSource, /const request = tx\.objectStore\(sourceStore\)\.get\(values\.sourceId\)/,
  'Settlement source existence/deletion must be checked in the same write transaction')
assert.match(saveSource, /const request = tx\.objectStore\('settlements'\)\.getAll\(\)/,
  'Payment limits must use settlement rows read inside the canonical write transaction')
assert.match(saveSource, /for \(const check of relationChecks\)[\s\S]*isDeleted\(parent\)/,
  'Referenced parent existence and soft-delete state must be rechecked in the write transaction')
assert.match(saveSource, /if \(existingId\)[\s\S]*isDeleted\(currentRecord\)/,
  'A stale form must not recreate a record that was deleted while it remained open')
assert.match(saveSource, /currentRecord\.updatedAt[\s\S]*existingRaw\?\.updatedAt/,
  'Concurrent edits must reject a stale version instead of overwriting newer canonical data')
assert.match(saveSource, /if \(alreadyPaid \+ Number\(values\.amount\) > sourceAmount \+ 0\.005\)/,
  'Concurrent linked payments must not exceed the authoritative source amount')
assert.match(saveSource, /if \(Number\.isFinite\(Number\(record\.cost\)\) && paid > Number\(record\.cost\) \+ 0\.005\)/,
  'Source edits must not reduce the authoritative amount below linked payments')

const removeSource = adminRepository.slice(adminRepository.indexOf('async remove(formKey'), adminRepository.indexOf('\n  },\n}'))
assert.match(removeSource, /const stores = \[storeName, 'pending_mutations', 'audit_history', \.\.\.\(sourceType \? \['settlements'\] : \[\]\)\]/,
  'Deleting a payment source must share a write transaction with settlement creation')
assert.match(removeSource, /tx\.objectStore\('settlements'\)\.getAll\(\)/,
  'Deletion must check linked settlements under the same transaction lock')
assert.match(removeSource, /if \(linked\.length\) \{ fail\(new Error\(/,
  'A source with linked payments must not be soft-deleted')

const restoreSource = backupRepository.slice(backupRepository.indexOf('async restoreCanonicalSnapshot'), backupRepository.indexOf('async resetCanonicalData'))
assert.match(restoreSource, /db\.transaction\(stores, 'readwrite'\)/,
  'Restore merge decisions and writes must remain atomic across canonical stores')
assert.doesNotMatch(restoreSource, /store\.clear\(/,
  'Restore must not replace the current dataset by clearing canonical stores')
assert.match(backupService, /saveLocalBackup\(await createBackup\(\)\)/,
  'Restore must checkpoint the merged canonical state before clearing its recovery journal')
assert.match(backupService, /verifyResetCheckpoint\(checkpoint, resetId\)/,
  'Reset must verify its durable recovery checkpoint before destructive work')
assert.match(backupService, /await backupRepository\.verifyCanonicalReset\(\)/,
  'Reset completion must verify all canonical stores are empty')

console.log('Admin Phase 3 integrity contracts passed: relationship checks are transaction-scoped and backup/restore/reset recovery guards remain in place.')
