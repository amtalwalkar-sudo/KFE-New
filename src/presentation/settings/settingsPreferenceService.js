import { setKfeThemeMode } from '../../presentation/theme/kfeThemeController.js'

export const ApplicationSettingsService = Object.freeze({
  resetPreferences() {
    return { themeMode: setKfeThemeMode('dark') }
  }
})
