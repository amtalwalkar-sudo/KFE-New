<script setup>
import KfeSettingsView from '../components/KfeSettingsView.vue'
import { BackupService } from '../application/backup/backupService.js'

const application = Object.freeze({
  exportBackup: () => BackupService.createBackup(),
  restoreBackup: payload => BackupService.restoreBackup(payload),
  resetAllData: () => BackupService.resetData(),
})
</script>

<template>
  <KfeSettingsView :application="application" />
</template>
