import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const tool = new URL('../../tools/theme-compliance-audit.mjs', import.meta.url)
const packageFile = new URL('../../package.json', import.meta.url)
const runnerFile = new URL('./runAllContracts.js', import.meta.url)

await readFile(tool, 'utf8')
const pkg = JSON.parse(await readFile(packageFile, 'utf8'))
const runner = await readFile(runnerFile, 'utf8')
const controller = await readFile(new URL('../presentation/theme/kfeThemeController.js', import.meta.url), 'utf8')
const adminView = await readFile(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
const canonicalCss = await readFile(new URL('../styles/kfe-ui.css', import.meta.url), 'utf8')
assert.equal(pkg.scripts['ui:theme-audit'], 'node tools/theme-compliance-audit.mjs')
assert.match(runner, /themeCompliance.contract.js/)
assert.match(controller, /VALID_MODES=new Set\\(\\['auto','light','dark'\\]\\)/)
assert.match(controller, /root\\.dataset\\.kfeTheme=resolved/)
assert.match(controller, /localStorage\\.setItem\\(STORAGE_KEY,selected\\)/)
assert.match(adminView, /☀ Light/)
assert.match(adminView, /☾ Dark/)
assert.match(adminView, /◐ Auto/)
assert.match(adminView, /chooseTheme/)
assert.match(adminView, /chooseNotifications/)
assert.match(adminView, /Control KFE ride and system action notifications/)
assert.match(canonicalCss, /--kfe-muted-text:#B8C2CD/)
assert.match(canonicalCss, /color-scheme:dark/)

const result = spawnSync(process.execPath, [tool.pathname], { encoding: 'utf8' })
assert.equal(result.status, 0, result.stdout + result.stderr)
assert.match(result.stdout, /THEME COMPLIANCE AUDIT: PASS/)

console.log('Theme compliance contract: PASS — Light/Dark/Auto themes and notification settings are available through canonical application settings.')
