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
assert.match(adminView, /groupAdminNavigationItems\(items,categories\)/)
assert.match(adminView, /isAdminSettingsItem\(key\)/)
assert.match(adminView, /getAdminSettingsKey\(key\)/)
// The home workspace and Settings are exclusive views; the header gear is the only Settings entry point.
assert.match(adminView, /<template v-if="!selected&&!settingsOpen">/)
assert.match(adminView, /<template v-else-if="settingsOpen">/)
assert.match(adminView, /<header class="admin-home-heading">\s*<h1>Admin workspace<\/h1>\s*<\/header>/)
assert.doesNotMatch(adminView, /admin-hero-settings|Business control centre|Changes are validated and saved through the authoritative Admin service/)
assert.match(adminView, /<template v-else-if="selected">\s*<section class="detail-screen"/)
assert.doesNotMatch(adminView, /from ['"][^'"]*\/domain\/(?:finance|time)\//)
console.log('Admin navigation contract: PASS — approved four categories/nine entries and settings routing are fixed.')
