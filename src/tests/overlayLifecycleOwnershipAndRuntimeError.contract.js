import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const workView = read('../views/WorkModuleView.vue')
const overlayLifecycle = read('../infrastructure/android/androidOverlayLifecycle.js')
const appEntry = read('../main.js')

// Shift start/end remain PWA-owned. Starting the shift prepares the overlay;
// ending it is a PWA store command, and the online-state watcher reconciles
// overlay visibility instead of adding a native END_SHIFT command.
const startStart = workView.indexOf('async function submitStart()')
const startEnd = workView.indexOf('async function goPickup(', startStart)
assert.ok(startStart >= 0 && startEnd > startStart, 'PWA shift-start handler must remain identifiable')
const submitStart = workView.slice(startStart, startEnd)
assert.match(submitStart, /store\.startShift\(/)
assert.match(submitStart, /androidOverlay\.prepare\(\)/)

const finishStart = workView.indexOf('async function finishEnd()')
const finishEnd = workView.indexOf('function finishEnded()', finishStart)
assert.ok(finishStart >= 0 && finishEnd > finishStart, 'PWA shift-end handler must remain identifiable')
const finish = workView.slice(finishStart, finishEnd)
assert.match(finish, /store\.endShift\(/)
assert.doesNotMatch(finish, /androidOverlay\.(?:endShift|completeEndShift)\(/,
  'PWA must own shift end; native shift-end actions are intentionally absent.')

assert.match(workView, /watch\(\(\) => store\.isOnline, \(\) => \{ void syncOverlay\(\) \}\)/)

const unmountStart = workView.indexOf('onBeforeUnmount(() => {')
const unmountEnd = workView.indexOf('\n})', unmountStart)
assert.ok(unmountStart >= 0 && unmountEnd > unmountStart, 'Work view cleanup hook must remain identifiable.')
const workUnmountCleanup = workView.slice(unmountStart, unmountEnd)
assert.doesNotMatch(workUnmountCleanup, /androidOverlay\.hide\(/,
  'Unmounting the Work view must not hide the overlay; only canonical shift lifecycle may end overlay visibility.')
const syncStart = workView.indexOf('async function syncOverlay()')
const syncEnd = workView.indexOf('async function openStart()', syncStart)
const sync = workView.slice(syncStart, syncEnd)
assert.match(sync, /if \(!store\.isOnline \|\| document\.visibilityState === 'visible'\)/)
assert.match(sync, /androidOverlay\.hide\(\)/,
  'PWA shift end must cause overlay hide through the online-state reconciliation.')

assert.match(overlayLifecycle, /if \(!active\?\.shift\?\.id\) return null/)
assert.match(overlayLifecycle, /if \(state\) await AndroidOverlay\.show\(state\)\s*else await AndroidOverlay\.hide\(\)/)
assert.match(overlayLifecycle, /if \(state\) await AndroidOverlay\.update\(state\)\s*else await AndroidOverlay\.hide\(\)/,
  'Background overlay restoration must hide rather than revive an overlay when no active shift exists.')

// A Vue render/runtime exception currently becomes a full-screen error because
// main.js replaces the #app tree. Preserve the diagnostic stack/component
// context so a feature-specific exception can be traced rather than guessed.
assert.match(appEntry, /app\.config\.errorHandler\s*=\s*\(err,\s*instance,\s*info\)/,
  'Global Vue error diagnostics must include component instance and error phase.')
assert.match(appEntry, /err\?\.stack/)
assert.match(appEntry, /info/)

console.log('PASS: PWA owns shift lifecycle; overlay visibility reconciles against active canonical shift; runtime screen exposes actionable diagnostics.')
