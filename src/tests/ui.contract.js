import fs from 'node:fs'
import assert from 'node:assert/strict'

const css = fs.readFileSync(new URL('../styles/kfe-ui.css', import.meta.url), 'utf8')

for (const token of ['--kfe-bg', '--kfe-surface', '--kfe-text', '--kfe-border', '--kfe-primary', '--kfe-danger', '--kfe-touch']) {
  assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Missing UI token: ' + token)
}
assert.match(css, /min-height:48px/, 'Interactive controls must meet the shared touch target')
assert.match(css, /:focus-visible/, 'Keyboard focus treatment is required')
assert.match(css, /prefers-reduced-motion:reduce/, 'Reduced-motion accessibility treatment is required')
assert.match(css, /safe-area-inset-bottom/, 'Mobile safe-area support is required')
assert.match(css, /kfe-skip-link/, 'Skip-link accessibility treatment is required')

console.log('KFE UI/UX foundation contract: PASS')
