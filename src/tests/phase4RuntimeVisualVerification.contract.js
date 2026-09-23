import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const smoke=readFileSync('tools/phase4-runtime-visual-smoke.mjs','utf8')
const db=readFileSync('src/utils/indexedDB.js','utf8')
const theme=readFileSync('src/presentation/theme/kfeThemeController.js','utf8')
const shell=readFileSync('src/components/shell/KfeShell.vue','utf8')
const work=readFileSync('src/views/WorkModuleView.vue','utf8')
const router=readFileSync('src/router/index.js','utf8')

for(const route of ['.cockpit','.timeline','.performance-page','.admin-page']) assert.match(smoke,new RegExp(route.replace(/[.*+?^{}()|[\]\\]/g,'\\$&')),'Phase 4 smoke must cover '+route)
for(const token of ['CNG refuelling','START ODOMETER','GPS connected','kfe.visual.theme.mode','reducedMotion','1280','390']) assert.ok(smoke.includes(token),'Phase 4 runtime smoke missing '+token)
assert.match(smoke,/kanishka_kfe_canonical_db/)
assert.match(smoke,/kanishka_kfe_synthetic_db/)
assert.match(db,/CANONICAL_DB_NAME = 'kanishka_kfe_canonical_db'/)
assert.match(db,/SYNTHETIC_DB_NAME = 'kanishka_kfe_synthetic_db'/)
assert.match(theme,/dayStart:'06:00',nightStart:'19:00'/)
assert.match(theme,/setKfeThemeMode/)
assert.match(shell,/header-gps/)
assert.match(shell,/Kanishka Enterprises/)
assert.match(router,/path: '\/performance',[\\s\\S]*header: false/)
assert.match(work,/aria-label="CNG refuelling"/)
assert.match(work,/START ODOMETER/)
console.log('Phase 4 runtime visual verification contract: PASS')
