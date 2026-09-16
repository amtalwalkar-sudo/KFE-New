<script setup>
import { onMounted, ref } from 'vue'
import { BackupService } from '../../application/backup/backupService.js'
import { BackupConfig } from '../../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../../application/backup/cloudBackupLifecycle.js'

const fileInput = ref(null)
const status = ref(null)
const cloudConfig = ref(BackupConfig.getBackupConfiguration())
const pendingRestore = ref(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')

const refresh = async () => {
  error.value = ''
  try {
    const local = await BackupService.getLocalBackup()
    status.value = local ? { savedAt: local.savedAt, ...BackupService.getBackupSummary(local.backup) } : null
    cloudConfig.value = BackupConfig.getBackupConfiguration()
  } catch (e) { error.value = e.message || 'Unable to read backup status.' }
}

const create = async () => {
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const backup = await BackupService.createBackup()
    await BackupService.saveLocalBackup(backup)
    await BackupService.downloadBackup(backup)
    notice.value = `Backup created: ${BackupService.getBackupSummary(backup).totalRecords} records.`
    await refresh()
  } catch (e) { error.value = e.message || 'Backup creation failed.' } finally { loading.value = false }
}

const chooseRestoreFile = () => fileInput.value?.click()
const onFile = async event => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''; notice.value = ''
  try {
    const backup = await BackupService.readBackupFile(file)
    pendingRestore.value = { backup, summary: BackupService.getBackupSummary(backup), name: file.name }
  } catch (e) { pendingRestore.value = null; error.value = e.message || 'Backup file validation failed.' }
}

const confirmRestore = async () => {
  if (!pendingRestore.value) return
  if (!confirm(`Restore ${pendingRestore.value.summary.totalRecords} records from ${pendingRestore.value.name}? This replaces the current KFE dataset.`)) return
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const summary = await BackupService.restoreBackup(pendingRestore.value.backup)
    pendingRestore.value = null
    notice.value = `Restore completed: ${summary.totalRecords} records restored.`
    await refresh()
  } catch (e) { error.value = e.message || 'Restore failed. The canonical transaction was rolled back if persistence failed.' } finally { loading.value = false }
}

const restoreLocal = async () => {
  const local = await BackupService.getLocalBackup()
  if (!local) { error.value = 'No local backup is available.'; return }
  pendingRestore.value = { backup: local.backup, summary: BackupService.getBackupSummary(local.backup), name: 'Latest local backup' }
}

const saveCloudConfig = () => {
  error.value = ''; notice.value = ''
  try {
    cloudConfig.value = BackupConfig.saveBackupConfiguration(cloudConfig.value)
    if (cloudConfig.value.enabled && cloudConfig.value.accessToken) CloudBackupLifecycle.initializeConfiguredCloudBackupProvider()
    notice.value = cloudConfig.value.enabled ? 'Dropbox backup configuration saved.' : 'Dropbox daily cloud backup disabled.'
  } catch (e) { error.value = e.message || 'Cloud configuration failed.' }
}

const clearCloudConfig = () => {
  BackupConfig.clearBackupConfiguration()
  cloudConfig.value = BackupConfig.getBackupConfiguration()
  notice.value = 'Dropbox configuration cleared.'
}

const backupCloudNow = async () => {
  loading.value = true; error.value = ''; notice.value = ''
  try {
    const result = await CloudBackupLifecycle.backupToConfiguredCloud()
    if (result.status === 'backed-up') notice.value = `Dropbox backup completed at ${result.completedAt}.`
    else if (result.status === 'disabled') error.value = 'Enable Dropbox and provide an access token first.'
    else if (result.status === 'failed') error.value = result.error?.message || 'Dropbox backup failed.'
    else notice.value = 'Dropbox backup is already current.'
    await refresh()
  } catch (e) { error.value = e.message || 'Dropbox backup failed.' } finally { loading.value = false }
}

const restoreCloud = async () => {
  if (!confirm('Restore the latest Dropbox backup? This replaces the current KFE dataset.')) return
  loading.value = true; error.value = ''; notice.value = ''
  try { const summary = await CloudBackupLifecycle.restoreFromConfiguredCloud(); notice.value = `Dropbox restore completed: ${summary.totalRecords} records restored.`; await refresh() }
  catch (e) { error.value = e.message || 'Dropbox restore failed.' }
  finally { loading.value = false }
}

onMounted(refresh)
</script>

<template>
<section class="backup-panel" aria-label="Backup and restore">
  <div class="head"><div><small>DATA SAFETY</small><h2>Backup &amp; Restore</h2><p>One complete KFE backup contains the canonical dataset. Phone storage, local recovery and Dropbox are destinations, not data owners.</p></div></div>
  <div class="destinations"><span>📱 Phone Storage</span><span>💾 Local Recovery</span><span>☁️ Dropbox</span></div>
  <div class="actions"><button class="primary" :disabled="loading" @click="create">Create backup</button><button :disabled="loading" @click="chooseRestoreFile">Restore from phone</button><button :disabled="loading" @click="restoreLocal">Restore latest local</button><input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile" /></div>
  <div class="cloud">
    <strong>Dropbox cloud backup</strong>
    <p>Configuration is isolated from KFE business records. Enable daily cloud backup, enter the Dropbox access token, and choose the managed backup path.</p>
    <label><input v-model="cloudConfig.enabled" type="checkbox" /> Enable daily Dropbox backup</label>
    <label>Dropbox backup path<input v-model="cloudConfig.path" type="text" autocomplete="off" /></label>
    <label>Dropbox access token<input v-model="cloudConfig.accessToken" type="password" autocomplete="off" spellcheck="false" /></label>
    <div class="cloud-actions"><button :disabled="loading" @click="saveCloudConfig">Save configuration</button><button :disabled="loading || !cloudConfig.enabled" @click="backupCloudNow">Back up to Dropbox now</button><button :disabled="loading || !cloudConfig.enabled" @click="restoreCloud">Restore from Dropbox</button><button :disabled="loading" @click="clearCloudConfig">Clear</button></div>
    <small v-if="cloudConfig.lastCloudBackupAt">Last successful cloud backup: {{cloudConfig.lastCloudBackupAt}}</small>
  </div>
  <div v-if="pendingRestore" class="pending"><strong>Validated backup ready</strong><p>{{pendingRestore.name}} · {{pendingRestore.summary.totalRecords}} total records · exported {{pendingRestore.summary.exportedAt}}</p><button class="danger" :disabled="loading" @click="confirmRestore">Confirm restore</button><button :disabled="loading" @click="pendingRestore=null">Cancel</button></div>
  <p v-if="error" class="error">{{error}}</p><p v-if="notice" class="notice">{{notice}}</p>
  <div class="status"><strong>Latest local recovery copy</strong><span v-if="status">{{status.totalRecords}} records · {{status.savedAt}}</span><span v-else>No local backup created yet.</span></div>
</section>
</template>

<style scoped>
.backup-panel{margin-top:14px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:14px}.head h2{margin:3px 0;font-size:1.05rem}.head p,.cloud p{margin:5px 0;color:#64748b;font-size:.74rem;line-height:1.45}.head small{font-size:.68rem;font-weight:800;letter-spacing:.08em;color:#64748b}.destinations{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.destinations span{background:#f1f5f9;border-radius:8px;padding:6px 8px;font-size:.7rem}.actions,.cloud-actions{display:flex;gap:7px;flex-wrap:wrap}.actions button,.pending button,.cloud-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:9px 11px;font-weight:650}.actions .primary{background:#0f172a;color:#fff;border-color:#0f172a}.cloud,.pending,.status{margin-top:11px;padding:10px;border-radius:9px;background:#f8fafc;font-size:.72rem}.cloud strong,.status strong,.pending strong{display:block}.cloud label{display:grid;gap:4px;margin:8px 0;font-size:.7rem;font-weight:650}.cloud label:first-of-type{display:flex;align-items:center;gap:7px}.cloud input[type=text],.cloud input[type=password]{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px;background:#fff}.cloud-actions{margin-top:8px}.pending{border:1px solid #cbd5e1}.danger{background:#7f1d1d!important;color:#fff;border-color:#7f1d1d!important}.error{color:#b42318;background:#fef3f2;padding:9px;border-radius:8px;font-size:.75rem}.notice{color:#166534;background:#f0fdf4;padding:9px;border-radius:8px;font-size:.75rem}.status{display:flex;justify-content:space-between;gap:10px}@media(max-width:640px){.status{flex-direction:column}}
</style>
