export function createNativeStartupChecks(confirmedOemSettings = new Set()) {
  return [
    { key: 'notifications', label: 'KFE notifications', ok: s => s.notificationsAllowed === true, request: 'notifications', setting: 'notifications', message: 'Allow KFE notifications so persistent ride actions can be shown.' },
    { key: 'location', label: 'Trip boundary location', ok: s => s.locationAllowed === true, request: 'location', setting: 'location', message: 'Allow precise location so KFE can save trip start/end coordinates and GPS fix timestamps locally, including offline.' },
    { key: 'locationServices', label: 'Phone location services', ok: s => s.locationServicesEnabled === true, setting: 'locationServices', message: 'Turn on Location on your phone, then return to KFE.' },
    { key: 'overlay', label: 'KFE floating ride controls', ok: s => s.overlayAllowed === true, setting: 'overlay', message: 'Allow KFE to display over other apps so the floating ride controls can work.' },
    // MIUI/HyperOS does not expose reliable public status APIs for these OEM-only
    // controls. Once the user confirms them, persist that confirmation across app
    // restarts; Android permissions and Location Services are still rechecked live.
    { key: 'oemAutostart', label: 'Xiaomi background autostart', ok: s => s.oemBackgroundSettingsRequired !== true || confirmedOemSettings.has('oemAutostart'), setting: 'oemAutostart', manualConfirmation: true, message: 'In Xiaomi settings, enable Background autostart for KFE. Return here and confirm only after it is enabled.', actionLabel: 'I enabled autostart — check again' },
    { key: 'oemBattery', label: 'Xiaomi battery restrictions', ok: s => s.oemBackgroundSettingsRequired !== true || confirmedOemSettings.has('oemBattery'), setting: 'oemBattery', manualConfirmation: true, message: 'Open KFE App info → Battery saver and choose No restrictions. MIUI does not expose a reliable status API, so confirm only after checking it.', actionLabel: 'I chose No restrictions — continue' }
  ]
}

export function findFirstMissingNativeCheck(status, confirmedOemSettings = new Set()) {
  return createNativeStartupChecks(confirmedOemSettings).find(check => !check.ok(status)) || null
}
