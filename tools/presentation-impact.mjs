#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const PROTECTED_PREFIXES = [
  'src/domain/',
  'src/repositories/',
  'src/application/',
  'src/infrastructure/',
  'src/utils/indexedDB.js',
]
const PRESENTATION_PREFIXES = [
  'src/components/',
  'src/layouts/',
  'src/presentation/',
  'src/views/',
  'src/styles/',
  'src/assets/styles/',
]

function normalize(p) {
  return p.replaceAll('\\', '/').replace(/^\.\//, '')
}

function isProtected(p) {
  const n = normalize(p)
  return PROTECTED_PREFIXES.some((prefix) => n === prefix || n.startsWith(prefix))
}

function isPresentation(p) {
  const n = normalize(p)
  return PRESENTATION_PREFIXES.some((prefix) => n === prefix || n.startsWith(prefix))
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(full))
    else if (/\.(vue|js|mjs)$/.test(entry.name)) files.push(full)
  }
  return files
}

function importCandidates(specifier, fromFile) {
  if (!specifier.startsWith('.')) return []
  const base = path.resolve(path.dirname(fromFile), specifier)
  return [base, `${base}.js`, `${base}.mjs`, `${base}.vue`, path.join(base, 'index.js')]
}

const files = await walk(SRC)
const graph = new Map()
for (const file of files) graph.set(normalize(path.relative(ROOT, file)), [])

for (const file of files) {
  const rel = normalize(path.relative(ROOT, file))
  const text = await readFile(file, 'utf8')
  const specs = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1])
  for (const spec of specs) {
    for (const candidate of importCandidates(spec, file)) {
      const target = normalize(path.relative(ROOT, candidate))
      if (graph.has(target)) graph.get(target).push(rel)
    }
  }
}

const requested = process.argv.slice(2).map(normalize)
if (!requested.length) {
  console.error('Usage: npm run ui:impact -- <src/path> [src/path ...]')
  process.exit(2)
}

const seen = new Set()
const queue = [...requested]
const impacted = []
while (queue.length) {
  const current = queue.shift()
  if (seen.has(current)) continue
  seen.add(current)
  const dependents = graph.get(current) ?? []
  for (const dependent of dependents) {
    impacted.push({ source: current, dependent })
    if (!seen.has(dependent)) queue.push(dependent)
  }
}

console.log('KFE PRESENTATION CHANGE IMPACT')
console.log('')
for (const item of requested) console.log(`Requested: ${item}`)
console.log('')

if (!impacted.length) {
  console.log('🟢 ISOLATED: no local import dependents were found.')
  process.exit(0)
}

const unique = [...new Map(impacted.map((item) => [`${item.source}=>${item.dependent}`, item])).values()]
for (const item of unique) {
  const protectedDependent = isProtected(item.dependent)
  const presentationDependent = isPresentation(item.dependent)
  const marker = protectedDependent ? '🔴' : presentationDependent ? '🟡' : '⚪'
  console.log(`${marker} ${item.dependent} ← imports ${item.source}`)
}

const protectedImpacts = unique.filter((item) => isProtected(item.dependent))
console.log('')
if (protectedImpacts.length) {
  console.log('⚠️ CHANGE IMPACT WARNING: this presentation change reaches protected KFE layers.')
  console.log('Do not proceed as a presentation-only change until the cross-layer dependency is reviewed.')
  process.exitCode = 1
} else {
  console.log('🟡 DEPENDENCY WARNING: other presentation files depend on the requested item.')
  console.log('This can be an expected presentation refactor, but those dependents must be included in the change review.')
}
