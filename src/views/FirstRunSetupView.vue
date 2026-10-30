<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminSourceForm from '../components/admin/AdminSourceForm.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'
import { BackupConfig } from '../application/backup/backupConfig.js'
import { CloudBackupLifecycle } from '../application/backup/cloudBackupLifecycle.js'
import { FirstRunSetupService } from '../application/setup/firstRunSetupService.js'
import { FormDraftService } from '../application/forms/formDraftService.js'

const emit = defineEmits(['complete'])
const loading = ref(true), saving = ref(false), error = ref(''), stepIndex = ref(0)
const state = ref({ version: 1, status: 'not-started', steps: {} })
const form = ref({}), cloud = ref({ enabled: false, accessToken: '', hasAccessToken: false })
const data = ref({ vehicle: [] })

const steps = [
  { key: 'businessSetup', title: 'Business start', intro: 'Save the business start date used as a basic reporting boundary.', form: 'businessSetup', optional: true },
  { key: 'vehicle', title: 'Vehicle', intro: 'Save vehicle identity and the opening odometer for Work.', form: 'vehicle', optional: true },
  { key: 'driver', title: 'Driver', intro: 'Save the driver/operator details used by Work.', form: 'driver', optional: true },
  { key: 'loan', title: 'Loan details', intro: 'Optionally save basic loan source details for your records. KFE will not create repayment projections.', form: 'loan', optional: true },
  { key: 'cloudBackup', title: 'Cloud backup', intro: 'Optionally connect Dropbox for backup. Local data remains authoritative and KFE continues to work offline. You can configure backup later in Admin Settings.', form: null, optional: true },
];

const current = computed(() => steps[stepIndex.value])
const definition = computed(() => {
  const key = current.value?.form
  if (!key) return null
  const d = structuredClone(ADMIN_FORM_DEFINITIONS[key])
  for (const field of d.fields || []) delete field.defaultValue
  for (const field of d.fields || []) {
    if (field.key === 'vehicleId') field.options = data.value.vehicle.map(x => ({ value: x.id, label: `${x.values?.registrationNumber || x.id} · ${x.values?.make || ''} ${x.values?.model || ''}`.trim() }))
  }
  return d
})
const progress = computed(() => Math.round(((stepIndex.value + 1) / steps.length) * 100))
const firstRunDraftIdentity = computed(() => ({ formId: 'first-run-' + (current.value?.key || 'setup'), workflowStep: 'SETUP', parentType: 'WORKFLOW', workflowId: 'first-run-' + (current.value?.key || 'setup') }))

const load = async () => {
  loading.value = true
  try {
    state.value = await FirstRunSetupService.getFirstRunSetupState()
    cloud.value = await BackupConfig.getBackupConfiguration()
    const vehicle = await AdminService.list('vehicle')
    data.value = { vehicle }
    const firstIncomplete = steps.findIndex(s => state.value.steps?.[s.key]?.status !== 'COMPLETE' && state.value.steps?.[s.key]?.status !== 'NOT_APPLICABLE')
    stepIndex.value = firstIncomplete >= 0 ? firstIncomplete : 0
  } catch (e) { error.value = e?.message || 'Unable to load setup.' }
  finally { loading.value = false }
}

const saveStep = async () => {
  if (saving.value) return
  error.value = ''
  const key = current.value.key
  if (key === 'cloudBackup') {
    if (cloud.value.enabled && !cloud.value.accessToken && !cloud.value.hasAccessToken) { error.value = 'Enter a Dropbox access token, or choose Skip for now.'; return }
    if (cloud.value.enabled && cloud.value.accessToken) {
      saving.value = true
      try {
        await BackupConfig.saveBackupConfiguration(cloud.value)
        await CloudBackupLifecycle.registerDailyCloudBackupSchedule()
        const backupResult = await CloudBackupLifecycle.backupToConfiguredCloud()
        if (backupResult.status !== 'backed-up' && backupResult.status !== 'fresh') throw new Error('Cloud backup connection was saved, but the first cloud backup could not be verified. You can skip this step and configure it later in Admin.')
        await FirstRunSetupService.setStepState(key, { status: 'COMPLETE' })
      } catch (e) { error.value = e?.message || 'Cloud backup setup failed.'; return }
      finally { saving.value = false }
    } else await FirstRunSetupService.setStepState(key, { status: 'NOT_APPLICABLE' })
  } else if (current.value.form) {
    saving.value = true
    try {
      await AdminService.save(current.value.form, form.value)
      await FirstRunSetupService.setStepState(key, { status: 'COMPLETE' })
      await FormDraftService.clear(firstRunDraftIdentity.value, { committed: true })
      form.value = {}
      if (key === 'vehicle') data.value = { vehicle: await AdminService.list('vehicle') }
    } catch (e) { error.value = e?.validation ? Object.values(e.validation).join(' ') : (e?.message || 'Could not save this step.'); return }
    finally { saving.value = false }
  } else {
    await FirstRunSetupService.setStepState(key, { status: 'COMPLETE' })
  }
  await nextStep()
}

const skip = async () => {
  error.value = ''
  const key = current.value.key
  if (current.value.form) { try { await FormDraftService.clear(firstRunDraftIdentity.value, { confirmedDiscard: true }) } catch (e) { error.value = e?.message || 'Could not discard the unfinished setup draft.'; return } }
  
  const notApplicable = key === 'loan' || key === 'cloudBackup'
  await FirstRunSetupService.setStepState(key, { status: notApplicable ? 'NOT_APPLICABLE' : 'SKIPPED' })
  await nextStep()
}
const nextStep = async () => {
  if (stepIndex.value < steps.length - 1) { stepIndex.value += 1; form.value = {}; return }
  await FirstRunSetupService.completeFirstRunSetup()
  emit('complete')
}
onMounted(load)
</script>

<template>
<section class="first-run" aria-label="KFE first-time setup">
  <div v-if="loading" class="setup-loading">Preparing your KFE setup…</div>
  <template v-else>
    <header class="setup-header"><div><div class="eyebrow">FIRST-TIME SETUP</div><h1>Let's set up KFE</h1><p>We'll collect the basic information KFE needs for Work. You can skip optional setup and complete basic records later in Admin.</p></div><strong>{{ progress }}%</strong></header>
    <div class="setup-progress"><span :style="{ width: progress + '%' }"></span></div>
    <section class="setup-card"><div class="step-count">STEP {{ stepIndex + 1 }} OF {{ steps.length }}</div><h2>{{ current.title }}</h2><p>{{ current.intro }}</p>
      <AdminSourceForm v-if="definition" :fields="definition.fields||[]" :model-value="form" :draft-identity="firstRunDraftIdentity" :busy="saving" submit-label="Save & Continue" @submit="values=>{form=values;saveStep()}" @cancel="skip" />
      <template v-else-if="current.key === 'cloudBackup'"><label class="toggle"><input v-model="cloud.enabled" type="checkbox"> Enable daily Dropbox backup</label><label class="field"><span>Dropbox access token</span><input v-model="cloud.accessToken" type="password" autocomplete="off" placeholder="Enter token to connect"></label><p class="hint">The token is stored in secure storage. KFE data remains local-first.</p><button class="primary" :disabled="saving || !cloud.enabled || !cloud.accessToken" @click="saveStep">Connect & Continue</button></template>
      <template v-else><button class="primary" @click="saveStep">I have this information</button></template>
      <button v-if="current.optional" class="skip" :disabled="saving" @click="skip">Skip — I'll fill this later</button><p v-if="error" class="error">{{ error }}</p>
    </section>
    <footer><span>Nothing is fabricated. Missing information stays incomplete until you enter it.</span><span>Work remains usable while historical setup is incomplete.</span></footer>
  </template>
</section>
</template>

