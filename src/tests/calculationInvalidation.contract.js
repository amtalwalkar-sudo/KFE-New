import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const calculationWriters = [
  'repositories/adminRepository.js',
  'repositories/fuelRepository.js',
  'repositories/shiftTripRepository.js',
  'repositories/backupRepository.js',
]

for (const relative of calculationWriters) {
  const source = read(relative)
  if (!source.includes('notifyCanonicalDataChanged')) {
    throw new Error(`Calculation-relevant persistence writer lacks canonical data invalidation: ${relative}`)
  }
}

const applicationSubscription = read('repositories/canonicalDataChangeRepository.js')
if (!applicationSubscription.includes('subscribeCanonicalDataChanges')) {
  throw new Error('Canonical data change repository subscription boundary is missing.')
}

const performanceService = read('application/performance/performanceService.js')
if (!performanceService.includes('subscribeCanonicalDataChanges')) {
  throw new Error('PerformanceService is not connected to the canonical data-change subscription boundary.')
}

const performanceView = read('views/PerformanceView.vue')
if (!performanceView.includes('PerformanceService.subscribeDataChanges')) {
  throw new Error('Performance UI is not subscribed through PerformanceService.')
}
if (/utils\/indexedDB\.js|repositories\//.test(performanceView)) {
  throw new Error('Performance UI must not bypass the application/repository boundary.')
}

console.log('Calculation invalidation boundary contract passed.')
