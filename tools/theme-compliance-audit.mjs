import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = new URL('../', import.meta.url)
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8')
const styleImports = [...main.matchAll(/import\s+['"]\.\/styles\/([^'"]+\.css)['"]/g)].map(m => m[1])
const expected = ['kfe-ui.css', 'forms.css', 'work-cockpit-hud.css', 'kfe-base-shell.css']
const forbidden = ['glassmorphic-polish.css', 'theme-adaptation.css', 'tokens.css']

const failures = []
for (const file of expected) {
  if (!styleImports.includes(file)) failures.push(`main.js must import canonical stylesheet ${file}`)
}
for (const file of forbidden) {
  if (styleImports.includes(file)) failures.push(`competing theme stylesheet is still imported: ${file}`)
}

const canonical = await readFile(new URL('../src/styles/kfe-ui.css', import.meta.url), 'utf8')
for (const token of ['--kfe-ui-bg','--kfe-ui-surface','--kfe-ui-text','--kfe-ui-border','--kfe-ui-accent','--kfe-success','--kfe-warning','--kfe-danger']) {
  if (!canonical.includes(token)) failures.push(`canonical theme token missing: ${token}`)
}
if (!/:root\[data-kfe-theme="day"\]/.test(canonical) || !/:root\[data-kfe-theme="night"\]/.test(canonical)) failures.push('canonical stylesheet must define both day and night theme states')

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await walk(path))
    else files.push(path)
  }
  return files
}

const sourceFiles = await walk(new URL('../src/', import.meta.url).pathname)
for (const path of sourceFiles) {
  const rel = relative(new URL('../', import.meta.url).pathname, path).replaceAll('\\','/')
  if (path.endsWith('.css')) {
    const css = await readFile(path, 'utf8')
    if (rel !== 'src/styles/kfe-ui.css') {
      const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase()).filter(v => !['#fff','#ffffff'].includes(v))
      if (literals.length) failures.push(`${rel}: hard-coded colour literals ${[...new Set(literals)].join(', ')}; use canonical theme tokens`)
      const fixedRgb = [...css.matchAll(/rgba?\(\s*\d+\s*,/g)].map(m => m[0])
      if (fixedRgb.length) failures.push(`${rel}: fixed rgba/rgb palette detected; use canonical theme tokens`)
      if (/:root\[data-kfe-theme=/.test(css)) failures.push(`${rel}: owns a page/local theme instead of consuming the canonical theme`)
      if (/--kfe-ui-(?:bg|surface|surface-2|text|border|accent|muted):\s*#/.test(css)) failures.push(`${rel}: redefines canonical theme palette`)
    }
  }
  if (path.endsWith('.vue')) {
    const vue = await readFile(path, 'utf8')
    const blocks = [...vue.matchAll(/<style[\\s\\S]*?<\\/style>/gi)]
    for (const block of blocks) {
      const css = block[0]
      const literals = [...css.matchAll(/#[0-9a-fA-F]{3,8}\\b/g)].map(m => m[0].toLowerCase()).filter(v => !['#fff','#ffffff'].includes(v))
      if (literals.length) failures.push(\`\${rel}: component style hard-codes colour literals \${[...new Set(literals)].join(', ')}; use canonical theme tokens\`)
      if ([...css.matchAll(/rgba?\\(\\s*\\d+\\s*,/g)].length) failures.push(\`\${rel}: component style contains fixed rgb/rgba palette; use canonical theme tokens\`)
      if (/:root\\[data-kfe-theme=/.test(css)) failures.push(\`\${rel}: component style owns a local theme\`)
    }
  }
}

for (const file of forbidden) {
  const candidate = new URL(`../src/styles/${file}`, import.meta.url)
  try { await readFile(candidate, 'utf8'); failures.push(`obsolete competing palette file still exists: src/styles/${file}`) } catch {}
}
try { await readFile(new URL('../src/assets/styles/tokens.css', import.meta.url), 'utf8'); failures.push('obsolete tokens.css palette still exists') } catch {}

if (failures.length) {
  console.error('THEME COMPLIANCE AUDIT: FAIL')
  for (const failure of failures) console.error('- '+failure)
  process.exit(1)
}
console.log('THEME COMPLIANCE AUDIT: PASS — one canonical theme, no competing active palettes, no component-local style blocks, and no fixed non-semantic colour literals outside the canonical theme.')
