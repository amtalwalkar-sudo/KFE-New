import assert from 'node:assert/strict'
import {
  ADMIN_NAVIGATION_CATEGORIES,
  ADMIN_NAVIGATION_ITEMS,
  ADMIN_SETTINGS_MENU,
  getAdminSettingsKey,
  groupAdminNavigationItems,
  isAdminSettingsItem,
} from '../presentation/admin/adminNavigation.js'
import { readFile } from 'node:fs/promises'

assert.deepEqual(ADMIN_NAVIGATION_CATEGORIES, [
  'Business Setup',
  'Vehicle Records',
  'Finance',
  'Settings',
])

assert.deepEqual(ADMIN_NAVIGATION_ITEMS.map(({ key, category, title }) => ({ key, category, title })), [
  { key: 'businessSetup', category: 'Business Setup', title: 'Business Setup' },
  { key: 'vehicle', category: 'Business Setup', title: 'Vehicle' },
  { key: 'driver', category: 'Business Setup', title: 'Driver' },
  { key: 'compliance', category: 'Vehicle Records', title: 'Compliance' },
  { key: 'maintenance', category: 'Vehicle Records', title: 'Maintenance' },
  { key: 'loan', category: 'Finance', title: 'Loan' },
  { key: 'settingsBackup', category: 'Settings', title: 'Backup & Restore' },
  { key: 'settingsApplication', category: 'Settings', title: 'Application Settings' },
  { key: 'settingsReset', category: 'Settings', title: 'Data Reset' },
])
assert.equal(ADMIN_NAVIGATION_ITEMS.length, 9)
assert.equal(new Set(ADMIN_NAVIGATION_ITEMS.map(item => item.key)).size, 9)
assert.equal(ADMIN_NAVIGATION_ITEMS.some(item => /ledger|prepayment/i.test(item.title)), false)
assert.deepEqual(ADMIN_SETTINGS_MENU.map(item => item.key), ['backup', 'application', 'reset'])
assert.deepEqual(
  ['settingsBackup', 'settingsApplication', 'settingsReset'].map(getAdminSettingsKey),
  ['backup', 'application', 'reset'],
)
assert.equal(isAdminSettingsItem('settingsBackup'), true)
assert.equal(isAdminSettingsItem('loan'), false)
assert.equal(getAdminSettingsKey('unknown'), null)

const groups = groupAdminNavigationItems()
assert.deepEqual(groups.map(group => [group.category, group.items.map(item => item.key)]), [
  ['Business Setup', ['businessSetup', 'vehicle', 'driver']],
  ['Vehicle Records', ['compliance', 'maintenance']],
  ['Finance', ['loan']],
  ['Settings', ['settingsBackup', 'settingsApplication', 'settingsReset']],
])
assert.equal(groups.reduce((count, group) => count + group.items.length, 0), 9)

const adminView = await readFile(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
const adminLayoutCss = await readFile(new URL('../components/admin/admin-redesign.css', import.meta.url), 'utf8')
assert.match(adminView, /groupAdminNavigationItems\(items,categories\)/)
assert.match(adminView, /isAdminSettingsItem\(key\)/)
assert.match(adminView, /getAdminSettingsKey\(key\)/)
// The home workspace and Settings are exclusive views; Settings is reached through its main-menu category, not a duplicate header icon.
assert.match(adminView, /<template v-if="!selected&&!settingsOpen">/)
assert.match(adminView, /<template v-else-if="settingsOpen">/)
// The Settings detail screen opens its selected destination directly; it must not repeat the three destination cards above the content.
assert.doesNotMatch(adminView, /<nav class="settings-menu"/)
assert.match(adminView, /<section v-if="settingsSelected==='backup'" class="settings-panel">[\s\S]*?<BackupRestorePanel\/>/)
assert.match(adminView, /v-else-if="settingsSelected==='application'" class="settings-panel"/)
assert.match(adminView, /<h2>Data Reset<\/h2>[\s\S]*?@click="resetData"/)
assert.match(adminView, /<header class="admin-home-heading">\s*<h1>Admin workspace<\/h1>\s*<\/header>/)
assert.doesNotMatch(adminView, /admin-hero-settings|Business control centre|Changes are validated and saved through the authoritative Admin service/)
assert.match(adminView, /<template v-else-if="selected">\s*<section class="detail-screen"/)
assert.doesNotMatch(adminView, /from ['"][^'"]*\/domain\/(?:finance|time)\//)
assert.ok(adminView.includes("window.addEventListener('popstate', handleAdminPopState)"))
assert.ok(adminView.includes('if (selected.value || settingsOpen.value) back()'))
assert.ok(adminView.includes('kfeAdminDetail: true'))
assert.ok(adminView.includes("window.removeEventListener('popstate', handleAdminPopState)"))
assert.match(adminView, /watch\(\[selected, settingsOpen, masterSelected\]/)
assert.match(shell, /kfe:shell-scroll-top/)
assert.match(adminView, /stopAdminViewportWatch\(\)/)
assert.match(adminLayoutCss, /\.admin-page \.admin-shell-bar \{ position:sticky; top:0; z-index:20;/)
assert.match(adminLayoutCss, /\.admin-page \{ box-sizing:border-box; width:100%; min-width:0; min-height:100%;/)
const adminSourceForm = await readFile(new URL('../components/admin/AdminSourceForm.vue', import.meta.url), 'utf8')
assert.match(adminView, /v-if="!masterSelected && formOpen" class="admin-record-form-screen"/)
assert.match(adminView, /v-if="formOpen" class="admin-record-form-screen"/)
assert.match(adminView, /Cancel and return to list/)
assert.match(adminLayoutCss, /\.admin-page \.admin-record-form-screen \{ display:block; width:100%; min-width:0;/)
assert.match(adminSourceForm, /grid-template-columns:minmax\(0,\.85fr\) minmax\(0,1\.15fr\)/)
assert.match(adminSourceForm, /@media\(max-width:360px\)\{\.source-form-actions\{grid-template-columns:minmax\(0,1fr\)/)
assert.match(adminSourceForm, /overflow-wrap:anywhere/)



assert.match(adminLayoutCss, /@media \(max-width:760px\)\s*\{\s*\.admin-page \.source-form-actions\s*\{\s*position:static !important;/)
assert.match(adminLayoutCss, /\.admin-page \.source-form-actions\s*\{[\s\S]*?backdrop-filter:none;\s*box-shadow:none;/)


const adminViewSource = await readFile(new URL('../views/AdminView.vue', import.meta.url), 'utf8')
const shellSource = await readFile(new URL('../components/shell/KfeShell.vue', import.meta.url), 'utf8')
assert.ok(adminViewSource.includes('kfe:shell-scroll-top'), 'Admin must emit a shell-owned viewport reset intent')
assert.ok(shellSource.includes('kfe:shell-scroll-top'), 'Shared shell must own the viewport reset operation')
assert.equal(adminViewSource.includes("document.querySelector('.content-scroll-area')"), false, 'Admin must not query shell-owned DOM')

console.log('Admin navigation contract: PASS — approved four categories/nine entries and settings routing are fixed.')

const adminShell = await readFile(new URL('../components/admin/AdminShell.vue', import.meta.url), 'utf8')
assert.doesNotMatch(adminShell, /settings-icon-button|toggle-settings|aria-label="Toggle Admin settings"/,
  'the duplicate header Settings gear must be removed')
assert.equal(ADMIN_NAVIGATION_ITEMS.filter(item => item.category === 'Settings').length, 3,
  'all three Settings destinations remain in the main Admin menu')
assert.deepEqual(ADMIN_NAVIGATION_ITEMS.filter(item => item.category === 'Settings').map(item => item.key),
  ['settingsBackup', 'settingsApplication', 'settingsReset'])
