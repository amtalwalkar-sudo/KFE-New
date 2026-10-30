<script setup>
import { onMounted, ref } from 'vue'
import { BackupService } from '../../application/backup/backupService.js'
import { isNativeBackupFilePlatform, downloadBackupText, readBackupFileText, chooseBackupFileText } from '../../application/backup/backupFileService.js'

const fileInput = ref(null)
const status = ref(null)
const pendingRestore = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')

const refresh = async () => {
  error.value = ''
  try {
    const local = await BackupService.getLocalBackup()
    status.value = local ? { savedAt: local.savedAt, ...BackupService.getBackupSummary(local.backup) } : null
  } catch (e) { error.value = e?.message || 'Unable to read the private recovery copy.' }
}
const withTimeout = (promise, milliseconds, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), milliseconds)
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value) }, failure => { clearTimeout(timer); reject(failure) })
})
const create = async () => {
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const backup = await withTimeout(BackupService.createBackup(), 15000, 'Backup is taking too long while reading KFE records. Please retry; no export was confirmed.')
    await withTimeout(BackupService.saveLocalBackup(backup), 10000, 'The private recovery copy could not be saved in time. Check device storage and retry.')
    const serialized = BackupService.serializeBackup(backup)
    await withTimeout(downloadBackupText(serialized, `kfe-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`), 60000, 'The file save did not finish. Choose a destination and confirm the save, then retry.')
    notice.value = `Backup created: ${BackupService.getBackupSummary(backup).totalRecords} records. JSON export requested successfully.`
    await refresh()
  } catch (e) { error.value = e?.message || 'Backup creation failed. No downloadable file was confirmed.' }
  finally { loading.value = false }
}
const chooseRestoreFile = async () => {
  if (!isNativeBackupFilePlatform()) { fileInput.value?.click(); return }
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const selected = await chooseBackupFileText()
    if (!selected) return
    const backup = BackupService.readBackupText(selected.text)
    pendingRestore.value = { backup, summary: BackupService.getBackupSummary(backup), name: selected.name }
  } catch (e) { if (!/cancelled/i.test(e?.message || '')) error.value = e?.message || 'Unable to open the selected backup file.' }
  finally { loading.value = false }
}
const onFile = async event => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''; notice.value = ''
  try {
    const backup = BackupService.readBackupText(await readBackupFileText(file))
    pendingRestore.value = { backup, summary: BackupService.getBackupSummary(backup), name: file.name }
  } catch (e) { pendingRestore.value = null; error.value = e?.message || 'Backup file validation failed.' }
}
const confirmRestore = async () => {
  if (!pendingRestore.value) return
  if (!confirm(`Restore ${pendingRestore.value.summary.totalRecords} records from ${pendingRestore.value.name}? Current records are preserved; missing records are added and conflicts are archived.`)) return
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const summary = await BackupService.restoreBackup(pendingRestore.value.backup)
    pendingRestore.value = null
    notice.value = `Restore merge completed: ${summary.merge?.added || 0} browser records added, ${summary.merge?.native?.added || 0} native work records imported, ${summary.merge?.duplicates || 0} identical records skipped, and ${summary.merge?.conflicts || 0} conflicts archived. Current records were preserved.`
    await refresh()
  } catch (e) { error.value = e?.message || 'Restore failed. The canonical transaction was rolled back if persistence failed.' }
  finally { loading.value = false }
}
onMounted(refresh)
</script>

<template>
  <section class="backup-panel" aria-label="Phone backup and restore">
    <h3>Phone Backup &amp; Restore</h3>
    <p class="backup-explainer">Create a JSON backup file you can keep on your phone or move elsewhere. KFE also keeps a private in-app recovery copy.</p>
    <div class="actions">
      <button class="primary" :disabled="loading" @click="create">Create backup</button>
      <button :disabled="loading" @click="chooseRestoreFile">Restore from phone</button>
      <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile" />
    </div>
    <div v-if="pendingRestore" class="pending">
      <strong>Validated backup ready</strong>
      <p>{{ pendingRestore.name }} · {{ pendingRestore.summary.totalRecords }} total records · exported {{ pendingRestore.summary.exportedAt }}</p>
      <button class="danger" :disabled="loading" @click="confirmRestore">Confirm restore</button>
      <button :disabled="loading" @click="pendingRestore = null">Cancel</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <div class="status">
      <div><strong>KFE private recovery copy</strong><small>Stored inside the app for interrupted-operation recovery.</small></div>
      <span v-if="status">{{ status.totalRecords }} records · {{ status.savedAt }}</span>
      <span v-else>No recovery copy created yet.</span>
    </div>
  </section>
</template>

<style scoped>
.backup-panel{margin-top:10px;border:1px solid var(--kfe-ui-border);border-radius:12px;background:var(--kfe-ui-surface);padding:11px}
.actions{display:flex;gap:7px;flex-wrap:wrap}
.actions button,.pending button{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);border-radius:9px;padding:9px 11px;font-weight:650}
.actions .primary{background:var(--kfe-ui-text);color:var(--kfe-ui-surface);border-color:var(--kfe-ui-text)}
.pending,.status{margin-top:9px;padding:10px;border-radius:9px;background:var(--kfe-ui-surface-2);font-size:.72rem}
.status{display:flex;justify-content:space-between;gap:10px}
.status strong,.pending strong{display:block}
.status small{display:block;color:var(--kfe-muted-text);font-size:.65rem;line-height:1.4;margin-top:3px}
.backup-explainer{margin:5px 0 10px;color:var(--kfe-muted-text);font-size:.72rem;line-height:1.45}
.pending{border:1px solid var(--kfe-ui-border)}
.danger{background:var(--kfe-danger)!important;color:var(--kfe-ui-surface);border-color:var(--kfe-danger)!important}
.error{color:var(--kfe-danger);background:color-mix(in srgb,var(--kfe-danger) 10%,var(--kfe-ui-surface));padding:9px;border-radius:8px;font-size:.75rem}
.notice{color:var(--kfe-success);background:color-mix(in srgb,var(--kfe-success) 10%,var(--kfe-ui-surface));padding:9px;border-radius:8px;font-size:.75rem}
@media(max-width:640px){.status{flex-direction:column}}
</style>
