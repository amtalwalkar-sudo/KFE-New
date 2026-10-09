import fs from 'node:fs'
import assert from 'node:assert/strict'

const root=new URL('../',import.meta.url)
const read=p=>fs.readFileSync(new URL(p,root),'utf8')

const universal=read('presentation/forms/universalFormSystem.js')
const admin=read('components/admin/AdminSourceForm.vue')
const baseInput=read('components/ui/BaseInput.vue')

assert.ok(universal.includes('function install()'),'Universal form runtime must have one installation boundary')
assert.ok(universal.includes('__KFE_UNIVERSAL_FORM_SYSTEM_INSTALLED__'),'Universal form runtime must be idempotent')
assert.ok(universal.includes('visualViewport'),'Universal form runtime must use the virtual viewport')
assert.ok(universal.includes('MutationObserver'),'Universal form runtime must cover dynamically mounted forms')
assert.ok(universal.includes('data-kfe-input'),'Universal form runtime must mark governed inputs')
assert.ok(universal.includes('enterKeyHint'),'Universal form runtime must govern Enter/Next/Done hints')
assert.ok(universal.includes('inputMode'),'Universal form runtime must govern numeric input hints')
assert.ok(universal.includes('primaryAction(surface)'),'Universal form runtime must have one primary action path')
assert.ok(!admin.includes('@keydown="handleEnter'),'Admin must not own a duplicate keyboard navigation handler')
assert.ok(baseInput.includes('inputmode'),'BaseInput must expose native inputmode')
assert.ok(baseInput.includes('enterkeyhint'),'BaseInput must expose native enterkeyhint')
console.log('Phase 1 Technical Forms Contract: PASS')
