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
  const day = block(css, ':root[data-kfe-theme="day"],:root[data-kfe-theme="light"]')
  const night = block(css, ':root[data-kfe-theme="night"],:root[data-kfe-theme="dark"]')

  const expected = {
    pickup: { day: token(day,'kfe-ui-accent'), night: token(night,'kfe-ui-accent') },
    start: { day: token(day,'kfe-success'), night: token(night,'kfe-success') },
    end: { day: token(day,'kfe-danger'), night: token(night,'kfe-danger') },
    surface: { day: token(day,'kfe-ui-surface'), night: token(night,'kfe-ui-surface') },
    text: { day: token(day,'kfe-ui-text'), night: token(night,'kfe-ui-text') },
    muted: { day: token(day,'kfe-muted-text'), night: token(night,'kfe-muted-text') }
  }

  const mappings = [
    '.cockpit .swipe-bar--pickup{--swipe-action-color:var(--kfe-ui-accent)}',
    '.cockpit .swipe-bar--start{--swipe-action-color:var(--kfe-success)}',
    '.cockpit .swipe-bar--end{--swipe-action-color:var(--kfe-danger)}'
  ]
  for (const marker of mappings) if (!css.includes(marker)) fail('PWA swipe semantic mapping drifted: ' + marker)

  const action = java.match(/private int actionColor\(\)\{([\s\S]*?)\n  \}/)
  if (!action) fail('Native actionColor() not found')
  const find = (stage) => {
    const re = new RegExp('"' + stage + '"\\.equals\\(actionStage\\)\\)return dark\\(\\)\\?Color\\.rgb\\(([^)]*)\\):Color\\.rgb\\(([^)]*)\\)')
    const m = action[1].match(re)
    if (!m) fail('Native semantic colour missing for ' + stage)
    return { night: m[1].split(',').map(Number), day: m[2].split(',').map(Number) }
  }
  const end = find('END_RIDE')
  const start = find('START_RIDE')
  const pickup = java.match(/return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.rgb\(([^)]*)\);\s*}/)
  if (!pickup) fail('Native GO_TO_PICKUP/default colour branch not found')
  const pickupColor = { night: pickup[1].split(',').map(Number), day: pickup[2].split(',').map(Number) }

  for (const [name, value] of Object.entries({pickup:pickupColor,start,end})) {
    if (!same(value.day,rgb(expected[name].day)) || !same(value.night,rgb(expected[name].night))) {
      fail('Native ' + name.toUpperCase() + ' swipe colour does not match canonical PWA token.')
    }
  }

  const surface = java.match(/private int surface\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.WHITE;/)
  if (!surface || !same(surface[1].split(',').map(Number),rgb(expected.surface.night))) fail('Native dark swipe surface does not match canonical dark surface.')

  const text = java.match(/private int textColor\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.rgb\(([^)]*)\);\}/)
  if (!text || !same(text[1].split(',').map(Number),rgb(expected.text.night)) || !same(text[2].split(',').map(Number),rgb(expected.text.day))) fail('Native overlay text colour does not match canonical PWA text token.')

  const muted = java.match(/private int mutedColor\(\)\{return dark\(\)\?Color\.rgb\(([^)]*)\):Color\.rgb\(([^)]*)\);\}/)
  if (!muted || !same(muted[1].split(',').map(Number),rgb(expected.muted.night)) || !same(muted[2].split(',').map(Number),rgb(expected.muted.day))) fail('Native overlay muted text colour does not match canonical PWA muted text token.')

  for (const marker of ['fx>=maxTravel*.70f','thumbW=dp(58)','barTop+dp(124)','localY>=dp(100)&&localY<=dp(132)']) {
    if (!java.includes(marker)) fail('Frozen native swipe mechanic marker missing: ' + marker)
  }
  return { status:'PASS', expected }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { runNativeSwipeVisualParityAudit(); console.log('NATIVE SWIPE VISUAL PARITY: PASS') }
  catch (error) { console.error('NATIVE SWIPE VISUAL PARITY: FAIL — ' + error.message); process.exitCode=1 }
}
