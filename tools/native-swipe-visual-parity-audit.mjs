#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(root, 'src/styles/kfe-ui.css')
const javaPath = path.join(root, 'android/app/src/main/java/com/kanishka/pwa/KfeOverlayService.java')
const read = (p) => fs.readFileSync(p, 'utf8')
const fail = (m) => { throw new Error(m) }

const block = (css, selector) => {
  const i = css.indexOf(selector)
  if (i < 0) fail('Missing canonical theme block: ' + selector)
  const start = css.indexOf('{', i)
  const end = css.indexOf('}', start)
  if (start < 0 || end < 0) fail('Malformed canonical theme block: ' + selector)
  return css.slice(start + 1, end)
}
const token = (b, name) => {
  const m = b.match(new RegExp('--' + name.replace(/^--/, '') + '\\s*:\\s*(#[0-9A-Fa-f]{6})\\b'))
  if (!m) fail('Missing canonical token --' + name)
  return m[1].toUpperCase()
}
const rgb = (hex) => {
  const s = hex.slice(1)
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)]
}
const same = (a,b) => a.join(',') === b.join(',')

export function runNativeSwipeVisualParityAudit() {
  const css = read(cssPath)
  const java = read(javaPath)
  // The canonical PWA now has one dark palette. Compare the native overlay's
  // dark branch to those tokens; no separate light/day palette is authoritative.
  const night = block(css, ':root')

  const expected = {
    pickup: { night: token(night,'kfe-ui-accent') },
    start: { night: token(night,'kfe-success') },
    end: { night: token(night,'kfe-danger') },
    surface: { night: token(night,'kfe-ui-surface') },
    text: { night: token(night,'kfe-ui-text') },
    muted: { night: token(night,'kfe-muted-text') }
  }

  const mappings = [
    '.cockpit .swipe-bar--pickup{--swipe-action-color:var(--kfe-ui-accent)}',
    '.cockpit .swipe-bar--start{--swipe-action-color:var(--kfe-success)}',
    '.cockpit .swipe-bar--end{--swipe-action-color:var(--kfe-danger)}'
  ]
  for (const marker of mappings) if (!css.includes(marker)) fail('PWA swipe semantic mapping drifted: ' + marker)

  const action = java.match(/private int actionColor\(\)\{([\s\S]*?)\n  \}/)
  if (!action) fail('Native actionColor() not found')
  const semantic = {
    END_RIDE: { key:'end' },
    START_RIDE: { key:'start' },
    GO_TO_PICKUP: { key:'pickup' }
  }
  const nativeDarkColour = (key) => rgb(expected[key].night).join(',')
  for (const [stage, {key}] of Object.entries(semantic)) {
    const marker = `return dark()?Color.rgb(${nativeDarkColour(key)}):Color.rgb(`
    if (!action[1].includes(marker)) fail('Native ' + stage + ' dark semantic colour does not match canonical PWA token: ' + nativeDarkColour(key))
  }

  const surface = java.match(/private int surface\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.WHITE;/)
  if (!surface || !same(surface[1].split(',').map(Number),rgb(expected.surface.night))) fail('Native dark swipe surface does not match canonical dark surface.')

  const text = java.match(/private int textColor\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.rgb\(([^)]*)\);\}/)
  if (!text || !same(text[1].split(',').map(Number),rgb(expected.text.night))) fail('Native overlay dark text colour does not match canonical PWA text token.')

  const muted = java.match(/private int mutedColor\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.rgb\(([^)]*)\);\}/)
  if (!muted || !same(muted[1].split(',').map(Number),rgb(expected.muted.night))) fail('Native overlay dark muted text colour does not match canonical PWA muted text token.')

  for (const marker of ['fx>=maxTravel*.70f','thumbW=dp(58)','barTop+dp(124)','localY>=dp(100)&&localY<=dp(132)']) {
    if (!java.includes(marker)) fail('Frozen native swipe mechanic marker missing: ' + marker)
  }
  return { status:'PASS', expected }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { runNativeSwipeVisualParityAudit(); console.log('NATIVE SWIPE VISUAL PARITY: PASS') }
  catch (error) { console.error('NATIVE SWIPE VISUAL PARITY: FAIL — ' + error.message); process.exitCode=1 }
}
