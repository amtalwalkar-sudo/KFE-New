/**
 * The approved Admin navigation inventory.
 *
 * Keep presentation labels and placement here; feature workflows remain owned
 * by AdminView/application services. Hidden finance workflows are deliberately
 * not top-level navigation entries.
 */
export const ADMIN_NAVIGATION_CATEGORIES = Object.freeze([
  'Business Setup',
  'Vehicle Records',
  'Finance',
  'Settings',
])

export const ADMIN_NAVIGATION_ITEMS = Object.freeze([
  Object.freeze({ key: 'businessSetup', category: 'Business Setup', title: 'Business Setup', icon: '⌂' }),
  Object.freeze({ key: 'vehicle', category: 'Business Setup', title: 'Vehicle', icon: '🚗' }),
  Object.freeze({ key: 'driver', category: 'Business Setup', title: 'Driver', icon: '👤' }),
  Object.freeze({ key: 'compliance', category: 'Vehicle Records', title: 'Compliance', icon: '✓' }),
  Object.freeze({ key: 'maintenance', category: 'Vehicle Records', title: 'Maintenance', icon: '🔧' }),
  Object.freeze({ key: 'loan', category: 'Finance', title: 'Loan', icon: '₹' }),
  Object.freeze({ key: 'settingsBackup', category: 'Settings', title: 'Backup & Restore', icon: '↥' }),
  Object.freeze({ key: 'settingsApplication', category: 'Settings', title: 'Application Settings', icon: '⚙' }),
  Object.freeze({ key: 'settingsReset', category: 'Settings', title: 'Data Reset', icon: '⌫' }),
])

export const ADMIN_SETTINGS_MENU = Object.freeze([
  Object.freeze({ key: 'backup', title: 'Backup & Restore', icon: '↥' }),
  Object.freeze({ key: 'application', title: 'Application Settings', icon: '⚙' }),
  Object.freeze({ key: 'reset', title: 'Data Reset', icon: '⌫' }),
])

const SETTINGS_ITEM_KEYS = Object.freeze({
  settingsBackup: 'backup',
  settingsApplication: 'application',
  settingsReset: 'reset',
})

export function isAdminSettingsItem(key) {
  return Object.hasOwn(SETTINGS_ITEM_KEYS, key)
}

export function getAdminSettingsKey(key) {
  return SETTINGS_ITEM_KEYS[key] ?? null
}

export function groupAdminNavigationItems(items = ADMIN_NAVIGATION_ITEMS, categories = ADMIN_NAVIGATION_CATEGORIES) {
  return categories.map(category => ({
    category,
    items: items.filter(item => item.category === category),
  }))
}
