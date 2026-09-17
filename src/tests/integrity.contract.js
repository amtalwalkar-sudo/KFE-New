import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_ADMIN_STORE_MAP } from '../repositories/adminRepository.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const adminRepositorySource = fs.readFileSync(path.join(root, 'src/repositories/adminRepository.js'), 'utf8')
const performanceSource = fs.readFileSync(path.join(root, 'src/domain/performance/performanceEngineV2.js'), 'utf8')
const serviceWorkerSource = fs.readFileSync(path.join(root, 'public/service-worker.js'), 'utf8')

assert.equal(Object.keys(CANONICAL_ADMIN_STORE_MAP).length, 14, 'All active Admin form/settings mappings must remain declared.')
assert.equal(Object.prototype.hasOwnProperty.call(CANONICAL_ADMIN_STORE_MAP, 'driverCollectedData'), false)
assert.match(adminRepositorySource, /deletedAt/)
assert.match(adminRepositorySource, /record\.deleted\s*=\s*true/)
assert.doesNotMatch(adminRepositorySource, /objectStore\([^)]*\)\.delete\(id\)/)
assert.match(performanceSource, /const live\s*=/)
assert.match(performanceSource, /!x\?\.deletedAt/)
assert.match(serviceWorkerSource, /periodicsync/)
assert.match(serviceWorkerSource, /kfe-daily-cloud-backup/)
assert.doesNotMatch(serviceWorkerSource, /\.\/js\//)

console.log('Integrity contract passed: soft-delete history, calculation exclusion, and current PWA service-worker wiring are protected.')
