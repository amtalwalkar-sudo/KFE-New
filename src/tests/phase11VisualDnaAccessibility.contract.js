import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync('src/styles/kfe-ui.css','utf8')
const shell = fs.readFileSync('src/components/shell/KfeShell.vue','utf8')
const dna = fs.readFileSync('KFE_VISUAL_DNA.md','utf8')

for (const token of ['--kfe-ui-bg','--kfe-ui-surface','--kfe-ui-text','--kfe-ui-border','--kfe-ui-accent','--kfe-success','--kfe-warning','--kfe-danger','--kfe-touch','--kfe-space-1','--kfe-space-2','--kfe-space-3','--kfe-space-4','--kfe-space-5','--kfe-space-6','--kfe-space-7']) {
  assert.ok(css.includes(token), `Missing canonical Visual DNA token: ${token}`)
}
assert.match(dna,/Status:\s*FROZEN/)
assert.match(css,/:focus-visible/)
assert.match(css,/prefers-reduced-motion:reduce/)
assert.match(css,/safe-area-inset-bottom/)
assert.match(css,/\.kfe-skip-link/)
assert.match(css,/border-radius:\s*var\(--kfe-radius-sm\)/)
assert.match(css,/min-height:\s*var\(--kfe-touch\)/)
assert.doesNotMatch(css,/--kfe-bg:#f8fafc/)
assert.doesNotMatch(css,/--kfe-touch:44px/)
assert.match(shell,/aria-label="KFE application header"/)
assert.match(shell,/aria-label="Primary navigation"/)
assert.match(shell,/aria-label="Work"/)
assert.match(shell,/aria-label="Timeline"/)
assert.match(shell,/aria-label="Performance"/)
assert.match(shell,/aria-label="Admin"/)
assert.match(shell,/getCurrentPosition/)
assert.doesNotMatch(shell,/watchPosition/)
assert.match(shell,/enableHighAccuracy:\s*false/)
assert.match(shell,/60000/)

console.log('KFE Phase 11 Visual DNA, accessibility, responsive and shell contract: PASS')
