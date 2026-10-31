<script setup>
import { onMounted, ref } from 'vue'
import { BackupService } from '../../application/backup/backupService.js'
import { BackupConfig } from '../../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../../application/backup/cloudBackupLifecycle.js'
import { BackupFileService } from '../../application/backup/backupFileService.js'

const fileInput = ref(null); const status = ref(null); const cloudConfig = ref({ enabled:false, path:'/Apps/KFE/kfe-latest-backup.json', accessToken:'', hasAccessToken:false, lastCloudBackupAt:null, lastCloudBackupAttemptAt:null, lastCloudBackupError:null, automaticBackupMode:'FOREGROUND_WHEN_APP_OPEN' });
const tokenInput=ref(null)
const setCloudEnabled=event=>{cloudConfig.value={...cloudConfig.value,enabled:event.target.checked}}
const setCloudToken=event=>{cloudConfig.value={...cloudConfig.value,accessToken:event.target.value}}
const pendingRestore = ref(null); const loading = ref(false); const error = ref(''); const notice = ref(''); const cloudNeedsReauth = ref(false)
const refresh = async () => { error.value=''; try { const local=await BackupService.getLocalBackup(); status.value=local?{savedAt:local.savedAt,...BackupService.getBackupSummary(local.backup)}:null; cloudConfig.value=await BackupConfig.getBackupConfiguration() } catch(e){error.value=e.message||'Unable to read backup status.'} }
const withTimeout = (promise, milliseconds, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), milliseconds)
  Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value) }, failure => { clearTimeout(timer); reject(failure) })
})
const create=async()=>{
  loading.value=true;error.value='';notice.value=''
  try {
    const backup=await withTimeout(BackupService.createBackup(),15000,'Backup is taking too long while reading KFE records. Please retry; no export was confirmed.')
    await withTimeout(BackupService.saveLocalBackup(backup),10000,'The recovery copy could not be saved in time. Check device storage and retry.')
    const serialized=BackupService.serializeBackup(backup)
    await withTimeout(BackupFileService.downloadBackupText(serialized,`kfe-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`),60000,'The file save did not finish. Choose a destination and confirm the save, then retry.')
    notice.value=`Backup created: ${BackupService.getBackupSummary(backup).totalRecords} records. JSON export requested successfully.`
    await refresh()
  } catch(e) {
    error.value=e.message||'Backup creation failed. No downloadable file was confirmed.'
  } finally { loading.value=false }
}
const chooseRestoreFile=async()=>{
  if(!BackupFileService.isNativeBackupPlatform()){fileInput.value?.click();return}
  loading.value=true;error.value='';notice.value=''
  try{
    const selected=await BackupFileService.chooseBackupFileText()
    if(!selected)return
    const backup=BackupService.readBackupText(selected.text)
    pendingRestore.value={backup,summary:BackupService.getBackupSummary(backup),name:selected.name}
  }catch(e){
    if(!/cancelled/i.test(e.message||''))error.value=e.message||'Unable to open the selected backup file.'
  }finally{loading.value=false}
}
const onFile=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;error.value='';notice.value='';try{const backup=BackupService.readBackupText(await BackupFileService.readBackupFileText(file));pendingRestore.value={backup,summary:BackupService.getBackupSummary(backup),name:file.name}}catch(e){pendingRestore.value=null;error.value=e.message||'Backup file validation failed.'}}
const confirmRestore=async()=>{if(!pendingRestore.value)return;if(!confirm(`Restore ${pendingRestore.value.summary.totalRecords} records from ${pendingRestore.value.name}? KFE keeps current records, adds missing backup records, and archives conflicting backup versions.`))return;loading.value=true;error.value='';notice.value='';try{const summary=await BackupService.restoreBackup(pendingRestore.value.backup);pendingRestore.value=null;notice.value=`Restore merge completed: ${summary.merge?.added || 0} browser records added (including conflict archives), ${summary.merge?.native?.added || 0} native work records imported, ${summary.merge?.duplicates || 0} identical records skipped, ${summary.merge?.conflicts || 0} conflicts archived. Current records were preserved.`;await refresh()}catch(e){error.value=e.message||'Restore failed. The canonical transaction was rolled back if persistence failed.'}finally{loading.value=false}}
const restoreLocal=async()=>{const local=await BackupService.getLocalBackup();if(!local){error.value='No local backup is available.';return}pendingRestore.value={backup:local.backup,summary:BackupService.getBackupSummary(local.backup),name:'Latest local backup'}}
const saveCloudConfig=async()=>{loading.value=true;error.value='';notice.value='';try{const saved=await BackupConfig.saveBackupConfiguration(cloudConfig.value);cloudConfig.value={...saved,accessToken:''};cloudNeedsReauth.value=false;notice.value=saved.enabled?'Automatic Dropbox backup enabled. It uploads when KFE is open and online.':'Automatic Dropbox backup disabled.';await CloudBackupLifecycle.registerDailyCloudBackupSchedule()}catch(e){error.value=e.message||'Cloud configuration failed.';cloudNeedsReauth.value=true}finally{loading.value=false}}
const clearCloudConfig=async()=>{await BackupConfig.clearBackupConfiguration();cloudConfig.value=await BackupConfig.getBackupConfiguration();notice.value='Dropbox configuration cleared.'}
const backupCloudNow=async()=>{loading.value=true;error.value='';notice.value='';try{const result=await CloudBackupLifecycle.backupToConfiguredCloud();if(result.status==='backed-up'){cloudNeedsReauth.value=false;notice.value=`Dropbox backup completed at ${result.completedAt}.`}else if(result.status==='disabled'){cloudNeedsReauth.value=true;error.value='Enable Dropbox and provide an access token first.'}else if(result.status==='failed'){cloudNeedsReauth.value=true;error.value=result.error?.message||'Dropbox backup failed. Re-enter the Dropbox access token if the connection has expired.'}else notice.value='Dropbox backup is already current.';await refresh()}catch(e){cloudNeedsReauth.value=true;error.value=e.message||'Dropbox backup failed. Re-enter the Dropbox access token if the connection has expired.'}finally{loading.value=false}}
const restoreCloud=async()=>{if(!confirm('Merge the latest Dropbox backup? KFE keeps current records, adds missing backup records, and archives conflicting backup versions.'))return;loading.value=true;error.value='';notice.value='';try{const summary=await CloudBackupLifecycle.restoreFromConfiguredCloud();notice.value=`Dropbox restore merge completed: ${summary.merge?.added || 0} records added (including conflict archives), ${summary.merge?.duplicates || 0} identical records skipped, ${summary.merge?.conflicts || 0} conflicts archived. Current records were preserved.`;await refresh()}catch(e){error.value=e.message||'Dropbox restore failed.'}finally{loading.value=false}}
onMounted(refresh)
</script>
<template><section class="backup-panel" aria-label="Backup and restore"><h3>Phone Backup</h3><p class="backup-explainer">Create a JSON backup file you can keep on your phone or move elsewhere. KFE also saves a separate private recovery copy inside the app; that internal copy is not a substitute for keeping your own file.</p><div class="actions"><button class="primary" :disabled="loading" @click="create">Create backup</button><button :disabled="loading" @click="chooseRestoreFile">Restore from phone</button><input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile" /></div><div class="cloud"><strong>Dropbox</strong><label><input :checked="cloudConfig.enabled" type="checkbox" @change="setCloudEnabled" /> Enable automatic backup</label><small class="schedule-note">Uploads run when KFE is open and online. Android does not guarantee Dropbox uploads while the app is closed or the phone is rebooting.</small><div v-if="!cloudConfig.hasAccessToken || cloudNeedsReauth" class="token-config"><label>Dropbox access token<input ref="tokenInput" :value="cloudConfig.accessToken" type="password" autocomplete="off" spellcheck="false" placeholder="Enter token to connect" @input="setCloudToken" /></label><small v-if="cloudConfig.hasAccessToken && cloudNeedsReauth">Connection needs attention. Re-enter the token if required.</small><button :disabled="loading || !cloudConfig.enabled || !cloudConfig.accessToken" @click="saveCloudConfig">Save connection</button></div><div v-else class="connected"><span>✓ Dropbox connected</span><button :disabled="loading" @click="saveCloudConfig">Save settings</button><button :disabled="loading || !cloudConfig.enabled" @click="backupCloudNow">Back up now</button><button :disabled="loading || !cloudConfig.enabled" @click="restoreCloud">Restore</button><button :disabled="loading" @click="clearCloudConfig">Disconnect</button></div><small v-if="cloudConfig.lastCloudBackupAt">Last successful backup: {{cloudConfig.lastCloudBackupAt}}</small><small v-if="cloudConfig.lastCloudBackupAttemptAt">Last attempt: {{cloudConfig.lastCloudBackupAttemptAt}}</small><small v-if="cloudConfig.lastCloudBackupError" class="cloud-backup-error">Automatic backup failed: {{cloudConfig.lastCloudBackupError}}</small></div><div v-if="pendingRestore" class="pending"><strong>Validated backup ready</strong><p>{{pendingRestore.name}} · {{pendingRestore.summary.totalRecords}} total records · exported {{pendingRestore.summary.exportedAt}}</p><button class="danger" :disabled="loading" @click="confirmRestore">Confirm restore</button><button :disabled="loading" @click="pendingRestore=null">Cancel</button></div><p v-if="error" class="error">{{error}}</p><p v-if="notice" class="notice">{{notice}}</p><div class="status"><div><strong>KFE private recovery copy</strong><small>Stored inside the app for recovery; not the exported phone file.</small></div><span v-if="status">{{status.totalRecords}} records · {{status.savedAt}}</span><span v-else>No recovery copy created yet.</span></div></section></template>

