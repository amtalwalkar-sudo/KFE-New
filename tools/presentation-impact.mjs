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
    else if (/\.(vue|js|mjs|css)$/.test(entry.name)) files.push(full)
  }
  return files
}


function extractGlobalStyleSources(source, file) {
  if (file.endsWith('.css')) return [source]
  if (!file.endsWith('.vue')) return []
  return [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)]
    .filter((match) => !/\bscoped\b/i.test(match[1]))
    .map((match) => match[2])
}

function extractSelectors(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors = new Set()
  for (const match of clean.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const header = match[1].trim()
    if (!header || header.startsWith('@')) continue
    for (const selector of header.split(',')) {
      const normalized = selector.trim().replace(/\s+/g, ' ')
      if (normalized) selectors.add(normalized)
    }
  }
  return selectors
}

function selectorTokens(selector) {
  return new Set([...selector.matchAll(/\.([_a-zA-Z][\w-]*)|#([_a-zA-Z][\w-]*)|\[([_a-zA-Z][\w-]*)/g)]
    .map((match) => match[1] ? '.' + match[1] : match[2] ? '#' + match[2] : '[' + match[3]))
}

function importCandidates(specifier, fromFile) {
  if (!specifier.startsWith('.')) return []
  const base = path.resolve(path.dirname(fromFile), specifier)
  return [base, `${base}.js`, `${base}.mjs`, `${base}.vue`, `${base}.css`, path.join(base, 'index.js')]
}

const acknowledgeNative = process.argv.includes('--acknowledge-native-impact')
const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--')).map(normalize)
if (!requested.length) {
  console.error('Usage: npm run ui:impact -- <src/path> [src/path ...] [--acknowledge-native-impact]')
  process.exit(2)
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

// Global CSS cascade check: report exact selector reuse and shared class/ID
// hooks across different unscoped stylesheets. Vue <style scoped> blocks are
// excluded because Vue scopes those selectors at build time.
const styleByFile = new Map()
for (const file of files) {
  const rel = normalize(path.relative(ROOT, file))
  const source = await readFile(file, 'utf8')
  const styles = extractGlobalStyleSources(source, rel)
  if (styles.length) styleByFile.set(rel, new Set(styles.flatMap(style => [...extractSelectors(style)])))
}
const requestedStyleFiles = requested.filter(file => styleByFile.has(file))
const cssOverlaps = []
for (const requestedFile of requestedStyleFiles) {
  const requestedSelectors = styleByFile.get(requestedFile)
  const requestedTokens = new Set([...requestedSelectors].flatMap(selector => [...selectorTokens(selector)]))
  for (const [otherFile, selectors] of styleByFile) {
    if (otherFile === requestedFile) continue
    for (const selector of selectors) {
      const shared = [...selectorTokens(selector)].filter(token => requestedTokens.has(token))
      if (shared.length) cssOverlaps.push({ requestedFile, otherFile, selector, shared: [...new Set(shared)] })
    }
  }
}
if (requestedStyleFiles.length) {
  console.log('GLOBAL CSS CASCADE CHECK')
  if (!cssOverlaps.length) console.log('🟢 No shared class/ID selector hooks found in other unscoped stylesheets.')
  else {
    for (const item of cssOverlaps.slice(0, 100)) console.log(`🟡 ${item.requestedFile} ↔ ${item.otherFile}: ${item.selector} (shared ${item.shared.join(', ')})`)
    if (cssOverlaps.length > 100) console.log(`… ${cssOverlaps.length - 100} additional selector overlaps omitted.`)
    console.log('Review these cascade overlaps before treating the change as component-isolated.')
  }
  console.log('')
}

// Vue-template hook ownership check. A component-template edit can affect
// styles in global CSS even when the changed file contains no <style> block.
function extractMarkupTokens(source) {
  const template = source.match(/<template\\b[^>]*>([\\s\\S]*?)<\\/template>/i)?.[1] ?? ''
  const tokens = new Set()
  for (const match of template.matchAll(/\\bclass\\s*=\\s*["']([^"']+)["']/g)) {
    for (const token of match[1].split(/\\s+/)) if (/^[A-Za-z_][\\w-]*$/.test(token)) tokens.add('.' + token)
  }
  for (const match of template.matchAll(/:class\\s*=\\s*["']([^"']+)["']/g)) {
    for (const literal of match[1].matchAll(/["']([A-Za-z_][\\w-]*)["']/g)) tokens.add('.' + literal[1])
    for (const key of match[1].matchAll(/(?:^|[{,]\\s*)([A-Za-z_][\\w-]*)\\s*:/g)) tokens.add('.' + key[1])
  }
  return tokens
}
const markupTokensByFile = new Map()
for (const file of files.filter(file => file.endsWith('.vue'))) {
  const rel = normalize(path.relative(ROOT, file))
  markupTokensByFile.set(rel, extractMarkupTokens(await readFile(file, 'utf8')))
}
const globalStyleTokensByFile = new Map([...styleByFile].map(([file, selectors]) => [
  file, new Set([...selectors].flatMap(selector => [...selectorTokens(selector)])),
]))
const requestedVueFiles = requested.filter(file => markupTokensByFile.has(file))
if (requestedVueFiles.length) {
  console.log('COMPONENT MARKUP / GLOBAL STYLE HOOK OWNERSHIP CHECK')
  let reported = 0
  for (const requestedFile of requestedVueFiles) {
    const tokens = markupTokensByFile.get(requestedFile)
    for (const token of tokens) {
      const otherComponents = [...markupTokensByFile]
        .filter(([file, otherTokens]) => file !== requestedFile && otherTokens.has(token))
        .map(([file]) => file)
      const globalOwners = [...globalStyleTokensByFile]
        .filter(([, styleTokens]) => styleTokens.has(token))
        .map(([file]) => file)
      if (!otherComponents.length && !globalOwners.length) continue
      reported += 1
      console.log(`🟡 ${requestedFile}: ${token}; shared by ${otherComponents.length ? otherComponents.join(', ') : 'no other Vue templates'}; global style sources: ${globalOwners.length ? globalOwners.join(', ') : 'none found'}`)
    }
  }
  if (!reported) console.log('🟢 No shared template hooks or global style owners found for the requested Vue component(s).')
  console.log('Review these as potential impact paths; shared design-system hooks may be intentional and should be explicitly documented.')
  console.log('This is a static ownership report, not a guarantee of pixel-level invariance; visual/interaction regression tests remain required.')
  console.log('')
}

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
  if (acknowledgeNative) {
    console.log('🟡 NATIVE CROSS-LAYER IMPACT ACKNOWLEDGED — protected dependents are reported but do not fail this native-impact gate.')
    console.log('Native changes must still pass the explicit native lifecycle/data contract and exact-APK verification.')
  } else {
    console.log('⚠️ CHANGE IMPACT WARNING: this presentation change reaches protected KFE layers.')
    console.log('Do not proceed as a presentation-only change until the cross-layer dependency is reviewed.')
    process.exitCode = 1
  }
} else {
  console.log('🟡 DEPENDENCY WARNING: other presentation files depend on the requested item.')
  console.log('This can be an expected presentation refactor, but those dependents must be included in the change review.')
}
