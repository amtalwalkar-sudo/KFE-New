<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import AdminSourceForm from '../components/admin/AdminSourceForm.vue'
import '../components/admin/admin-redesign.css'
import AdminShell from '../components/admin/AdminShell.vue'
import BackupRestorePanel from '../components/admin/BackupRestorePanel.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'
import { FormDraftService } from '../application/forms/formDraftService.js'
import { BackupService } from '../application/backup/backupService.js'
import { ApplicationSettingsService } from '../presentation/settings/settingsPreferenceService.js'

import {
  ADMIN_NAVIGATION_ITEMS as items,
  ADMIN_NAVIGATION_CATEGORIES as categories,
  getAdminSettingsKey,
  isAdminSettingsItem,
  groupAdminNavigationItems,
} from '../presentation/admin/adminNavigation.js'
const selected=ref(null),settingsOpen=ref(false),settingsSelected=ref('backup'),masterSelected=ref(null)
const adminSearch=ref(''),recordSearch=ref('')
const notificationsEnabled=ref(readNotificationsPreference())
const records=ref([]),all=ref({vehicle:[],driver:[],loan:[],compliance:[],maintenance:[]})
const loading=ref(false),saving=ref(false),error=ref(''),notice=ref('')
const formOpen=ref(false),editing=ref(null),draft=ref({}),formErrors=ref({})
const draftWorkflowIds = ref({})
const draftWorkflowResolutions = new Map()
const draftWorkflowKey = (formId, workflowStep, parentId = null) => [formId, workflowStep, parentId || ''].join(':')
async function beginDraftWorkflow(formId, workflowStep, parentId = null) {
  const key = draftWorkflowKey(formId, workflowStep, parentId)
  const pending = draftWorkflowResolutions.get(key)
  if (pending) return pending
  const resolution = (async () => {
    try {
      const parentType = parentId ? 'ADMIN_RECORD' : 'WORKFLOW'
      const existing = await FormDraftService.latestWorkflow('admin-' + formId, workflowStep, parentType, parentId)
      const workflowId = parentId ? null : (existing?.workflowId || FormDraftService.newWorkflowId())
      draftWorkflowIds.value = { ...draftWorkflowIds.value, [key]: workflowId }
      return true
    } catch (cause) {
      error.value = cause?.message || 'Unable to recover the unfinished Admin form. Try again before entering data.'
      return false
    }
  })()
  draftWorkflowResolutions.set(key, resolution)
  try { return await resolution }
  finally { if (draftWorkflowResolutions.get(key) === resolution) draftWorkflowResolutions.delete(key) }
}
const buildDraftIdentity = (formId, parentId = null, workflowStep = 'EDIT') => {
  const workflowId = draftWorkflowIds.value[draftWorkflowKey(formId, workflowStep, parentId)]
  if (!workflowId && !parentId) return null
  return {
    formId: 'admin-' + formId, workflowStep,
    parentType: parentId ? 'ADMIN_RECORD' : 'WORKFLOW',
    parentId: parentId || null,
    workflowId
  }
}
const sourceFormDraftIdentity = computed(() => buildDraftIdentity(selected.value || 'source', editing.value, editing.value !== null ? 'EDIT' : 'CREATE'))
async function clearFormDraft(identity) {
  if (!identity) return
  try { await FormDraftService.clear(identity, { committed: true }) }
  catch (_) { notice.value = (notice.value ? notice.value + ' ' : '') + 'Saved successfully; an unfinished draft could not be cleared. Reopen the form and verify before continuing.' }
}
const money=v=>v===null||v===undefined||v===''?'—':Number.isFinite(Number(v))?'₹'+Number(v).toLocaleString('en-IN',{maximumFractionDigits:2}):'—'
const clone=v=>structuredClone(toRaw(v))
function label(key,record){const v=record?.values||record||{};if(key==='businessSetup')return v.businessStartDate ? `Business start · ${v.businessStartDate}` : 'Business Setup';if(key==='vehicle')return [v.registrationNumber,v.make,v.model].filter(Boolean).join(' · ')||record?.id;if(key==='driver')return v.name||record?.id;if(key==='loan')return [v.lender,v.accountReference].filter(Boolean).join(' · ')||record?.id;if(key==='compliance')return v.complianceType||record?.id;if(key==='maintenance')return v.maintenanceType||record?.id;return record?.id||'—'}
const currentItem=computed(()=>items.find(x=>x.key===selected.value)||null)
const masterMode=computed(()=>['vehicle','driver','compliance'].includes(selected.value))
const masterRecord=computed(()=>masterSelected.value?records.value.find(x=>x.id===masterSelected.value)||null:null)
const currentDefinition=computed(()=>currentItem.value?ADMIN_FORM_DEFINITIONS[currentItem.value.key]:null)
const activeDefinition=computed(()=>{if(!currentDefinition.value)return null;const d=clone(currentDefinition.value);for(const f of d.fields||[]){if(f.key==='vehicleId')f.options=all.value.vehicle.map(x=>({value:x.id,label:label('vehicle',x)}));if(f.key==='driverId')f.options=all.value.driver.map(x=>({value:x.id,label:label('driver',x)}));if(f.key==='loanId')f.options=all.value.loan.map(x=>({value:x.id,label:label('loan',x)}))}return d})
const groupedItems=computed(()=>groupAdminNavigationItems(items,categories))
const visibleGroupedItems=computed(()=>{const q=adminSearch.value.trim().toLowerCase();return groupedItems.value.map(group=>({...group,items:group.items.filter(item=>!q||`${item.title} ${item.category} ${item.key}`.toLowerCase().includes(q))})).filter(group=>group.items.length)})
const filteredRecords=computed(()=>{const q=recordSearch.value.trim().toLowerCase();return records.value.filter(record=>!q||`${label(selected.value,record)} ${JSON.stringify(record.values||{})}`.toLowerCase().includes(q))})
function readNotificationsPreference(){return ApplicationSettingsService.getNotificationsEnabled()}
function chooseNotifications(enabled){notificationsEnabled.value=ApplicationSettingsService.setNotificationsEnabled(enabled);clearMessages()}
function clearMessages(){error.value='';notice.value=''}
function onDraftError(cause){error.value=cause?.message||'Unable to preserve unfinished form draft.'}
async function openItem(key){
  if(isAdminSettingsItem(key)){clearMessages();selected.value=null;settingsOpen.value=true;settingsSelected.value=getAdminSettingsKey(key);return}
  clearMessages()
  settingsOpen.value=false;selected.value=key;masterSelected.value=null;formOpen.value=false;editing.value=null;draft.value={}
  load()
}
function openMasterRecord(record){clearMessages();masterSelected.value=record.id;formOpen.value=false;editing.value=null;draft.value={}}
function backMasterList(){clearMessages();masterSelected.value=null;formOpen.value=false;editing.value=null;draft.value={}}
function masterFieldValue(field,record){const v=record?.values?.[field.key];if(v===undefined||v===null||v==='')return '—';if(field.type==='checkbox')return v?'Yes':'No';if(field.type==='select'){if(field.key==='vehicleId')return label('vehicle',all.value.vehicle.find(x=>x.id===v));if(field.key==='driverId')return label('driver',all.value.driver.find(x=>x.id===v));const opts=field.options||[];const found=opts.find(x=>x?.value===v);return found?.label||v}return String(v)}
function back(){selected.value=null;settingsOpen.value=false;formOpen.value=false;editing.value=null;draft.value={};clearMessages()}
function chooseSetting(key){settingsSelected.value=key;clearMessages()}
async function add(){
  if(saving.value)return
  clearMessages();formErrors.value={}
  if(!await beginDraftWorkflow(selected.value||'source','CREATE'))return
  editing.value=null;draft.value=Object.fromEntries((currentDefinition.value?.fields||[]).map(field=>[field.key,field.defaultValue]));formOpen.value=true
}
async function edit(record){
  if(saving.value)return
  formErrors.value={}
  if(!await beginDraftWorkflow(selected.value||'source','EDIT',record.id))return
  editing.value=record.id;draft.value=clone(record.values||{});formOpen.value=true
}
function updateDraft(v){draft.value={...v}}
function clearFieldError({key}){if(!(key in formErrors.value))return;const next={...formErrors.value};delete next[key];formErrors.value=next}
function onSourceFieldChange(change){draft.value={...draft.value,[change.key]:change.value};clearFieldError(change)}
async function save(values){if(saving.value)return;clearMessages();formErrors.value={};saving.value=true;try{
  const id=editing.value
  const draftIdentity = sourceFormDraftIdentity.value
  const payload=(selected.value==='compliance'||selected.value==='maintenance')?{...values,cost:Number(values.cost)||0}:values
   const saved=await AdminService.save(selected.value,payload,id)
   if(!saved?.id)throw new Error('The record was not confirmed by the canonical repository.')
   await clearFormDraft(draftIdentity)
   // Source records are obligations/expense facts. Actual cash settlement is a
   // separate authoritative record with its own actual payment date.
   // Never synthesize a payment merely because a source record was saved.
   notice.value=(id!==null?'Record updated.':'Record created.');formOpen.value=false;editing.value=null;await load()
}catch(e){formErrors.value=e.validation&&typeof e.validation==='object'?e.validation:{};error.value=e.validation?Object.values(e.validation).flat().join(' '):e.message||'Save failed.'}finally{saving.value=false}}
async function remove(record){if(!confirm('Delete this record? Related records may prevent deletion.'))return;clearMessages();loading.value=true;try{await AdminService.remove(selected.value,record.id);notice.value='Record deleted.';await load()}catch(e){error.value=e.message||'Delete failed.'}finally{loading.value=false}}
async function resetData(){if(!confirm('Reset all KFE data? Business records will be erased and application preferences restored to defaults. A recovery checkpoint will be retained.'))return;if(!confirm('Final confirmation: erase all current KFE business records and reset application preferences to defaults? A recovery checkpoint will be retained.'))return;loading.value=true;clearMessages();try{await BackupService.resetData();const defaults=ApplicationSettingsService.resetPreferences();notificationsEnabled.value=defaults.notificationsEnabled;notice.value='All canonical KFE data has been reset. Application preferences restored to defaults.'}catch(e){error.value=e.message||'Data reset failed.'}finally{loading.value=false}}
async function load(){loading.value=true;error.value='';try{for(const k of Object.keys(all.value))all.value[k]=await AdminService.list(k);records.value=selected.value?await AdminService.list(selected.value):[]}catch(e){error.value=e.message||'Unable to load Admin data.'}finally{loading.value=false}}
// The Android system Back button must unwind Admin's in-view selection before the WebView exits.
let stopAdminBackStateWatch = null
function handleAdminPopState() {
  if (selected.value || settingsOpen.value) back()
}
function resetAdminViewport() {
  // KFE scrolls inside the shell's main region, not the document body.
  // Reset both so restored scroll from another menu cannot hide the Admin header.
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  window.dispatchEvent(new Event('kfe:shell-scroll-top'))
}
onMounted(()=>{
  load()
  window.addEventListener('popstate', handleAdminPopState)
  stopAdminBackStateWatch = watch([selected, settingsOpen], ([section, settings]) => {
    if (section || settings) {
      window.history.pushState(
        { ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}), kfeAdminDetail: true },
        '',
        window.location.href
      )
    }
  })
})
// All Admin destinations share the same shell. Reset its scroll position after
// navigation so every menu opens with the full Administration bar visible.
const stopAdminViewportWatch = watch([selected, settingsOpen, masterSelected], async () => {
  await nextTick()
  requestAnimationFrame(resetAdminViewport)
}, { flush: 'post' })
onBeforeUnmount(()=>{
  window.removeEventListener('popstate', handleAdminPopState)
  stopAdminBackStateWatch?.()
  stopAdminBackStateWatch = null
  stopAdminViewportWatch()
})
</script>

<template>
<AdminShell
  :show-back="Boolean(selected || settingsOpen)"
  :title="settingsOpen ? 'Settings' : selected ? (currentItem?.title || 'Admin') : 'Admin'"
  @back="back"
>


<template v-if="!selected&&!settingsOpen">
  <header class="admin-home-heading">
    <h1>Admin workspace</h1>
  </header>
  <div class="admin-home-tools"><label class="admin-search-field"><span aria-hidden="true">⌕</span><input v-model="adminSearch" type="search" placeholder="Find an Admin area…" aria-label="Search Admin areas"></label><span class="admin-search-hint">{{visibleGroupedItems.reduce((count,group)=>count+group.items.length,0)}} of {{items.length}} destinations</span></div>
  <div v-if="!visibleGroupedItems.length" class="empty admin-no-results">No Admin areas match “{{adminSearch}}”. Try a different search.</div>
  <div class="admin-workspace">
    <section v-for="group in visibleGroupedItems" :key="group.category" class="admin-category">
      <div class="admin-category-heading"><span class="category-label">{{group.category}}</span><span class="admin-category-count">{{group.items.length}}</span></div>
      <div class="admin-category-grid">
        <button v-for="item in group.items" :key="item.key" type="button" class="admin-item" @click="openItem(item.key)">
          <span class="admin-item-icon" aria-hidden="true">{{item.icon}}</span>
          <span class="admin-item-copy"><strong>{{item.title}}</strong><small>{{item.key==='businessSetup'?'Set the business start boundary':item.key==='vehicle'?'Vehicle identity and lifecycle':item.key==='driver'?'Driver identity and assignment':item.key==='compliance'?'Validity and compliance cost':item.key==='maintenance'?'Authoritative actual maintenance':item.key==='settingsBackup'?'Export, restore and protect KFE data':item.key==='settingsApplication'?'Theme and notification preferences':item.key==='settingsReset'?'Reset business data with recovery safeguards':'Loan details and saved records'}}</small></span>
          <span class="admin-item-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>
  </div>
</template>

<template v-else-if="settingsOpen">
<section class="settings-screen"><section v-if="settingsSelected==='backup'" class="settings-panel"><h2>Backup &amp; Restore</h2><p class="settings-context">Export a copy before making major changes. After a restore, check the resulting records and any reported conflicts.</p><BackupRestorePanel/></section><section v-else-if="settingsSelected==='application'" class="settings-panel"><h2>Application Settings</h2><p class="settings-context">These preferences affect the KFE app experience; the dark theme is fixed.</p><div class="application-setting"><strong>Appearance</strong><p>Dark theme is always enabled in KFE.</p></div><div class="application-setting"><strong>Notifications</strong><p>Save your preference for KFE app notifications. Native Work action controls remain independent.</p><label class="notification-toggle"><input type="checkbox" :checked="notificationsEnabled" @change="chooseNotifications($event.target.checked)"><span>Enable notifications</span></label></div></section><section v-else class="settings-panel"><h2>Data Reset</h2><p class="settings-context">Use this only when you intentionally want to start with an empty business workspace.</p><p>This permanently clears canonical KFE business records.</p><p class="reset-safety-note">Before resetting, create a phone backup JSON file and keep it somewhere you control. KFE retains a private recovery checkpoint, but that internal copy is not a substitute for your own exported backup.</p><button class="danger-button" :disabled="loading" @click="resetData">Reset all data</button></section></section>
</template>


<template v-else-if="selected">
<section class="detail-screen" :aria-busy="loading" aria-labelledby="admin-detail-title"><div class="detail-title"><span class="item-icon" aria-hidden="true">{{currentItem.icon}}</span><div><div class="category-label">{{currentItem.category}}</div><h1 id="admin-detail-title">{{currentItem.title}}</h1></div></div><p class="detail-intro">{{selected==='businessSetup'?'Set the business start date used by KFE planning.':selected==='vehicle'?'Maintain the vehicle identity and lifecycle details used across KFE.':selected==='driver'?'Manage driver identity and assignment details.':selected==='compliance'?'Track compliance validity, costs, payments, and supporting records.':selected==='maintenance'?'Record actual maintenance details.':selected==='loan'?'Maintain saved loan details.':'Review and manage the selected Admin records.'}}</p><p v-if="error" class="message error" role="alert" aria-live="assertive">{{error}}</p><p v-if="notice" class="message notice" role="status" aria-live="polite">✓ {{notice}}</p>

<template v-if="masterMode">
<div v-if="!masterSelected && formOpen" class="admin-record-form-screen">
  <div class="detail-actions"><button class="secondary" type="button" @click="formOpen=false;editing=null">‹ Cancel and return to list</button></div>
  <AdminSourceForm :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="editing===null" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" :submit-label="editing!==null?'Update record':'Save record'" @draft-error="onDraftError"/>
</div>
<div v-else-if="!masterSelected">
  <div class="admin-list-tools"><label class="admin-search-field"><span aria-hidden="true">⌕</span><input v-model="recordSearch" type="search" :placeholder="'Search '+currentItem.title.toLowerCase()+' records…'" :aria-label="'Search '+currentItem.title+' records'"></label><span class="admin-search-hint">{{filteredRecords.length}} {{filteredRecords.length===1?'record':'records'}}<template v-if="recordSearch"> found</template></span></div>
  <div class="detail-actions"><button class="primary" @click="add">＋ Create {{currentDefinition?.createLabel||currentItem.title}}</button></div>
  <div v-if="loading&&!records.length" class="empty">Loading…</div>
  <div v-else-if="filteredRecords.length" class="record-list">
    <button v-for="record in filteredRecords" :key="record.id" class="clean-card master-list-row" @click="openMasterRecord(record)">
      <span><strong>{{label(selected,record)}}</strong><small>{{selected==='vehicle'?[record.values?.registrationNumber,record.values?.make,record.values?.model].filter(Boolean).join(' · '):selected==='driver'?[record.values?.phone,record.values?.licenseNumber].filter(Boolean).join(' · '):[record.values?.validFrom,record.values?.validUntil].filter(Boolean).join(' → ')}}</small>
      <small v-if="selected==='compliance'">Cost {{money(record.values?.cost)}}</small></span><span>›</span>
    </button>
  </div>
  <div v-else-if="!loading" class="empty">{{recordSearch ? 'No '+currentItem.title.toLowerCase()+' records match your search.' : 'No records yet. Create the first record to get started.'}}</div>
</div>
<div v-else>
  <div class="detail-actions"><button class="secondary" @click="backMasterList">‹ {{currentItem.title}} list</button><button class="primary" @click="edit(masterRecord)">Edit {{currentItem.title}}</button></div>
  <section class="clean-card master-detail-card">
    <div class="master-detail-heading"><strong>{{label(selected,masterRecord)}}</strong><span>{{masterRecord?.updatedAt||'—'}}</span></div>
    <div class="master-fields"><div v-for="field in currentDefinition.fields" :key="field.key" class="master-field"><span>{{field.label}}</span><strong>{{masterFieldValue(field,masterRecord)}}</strong></div></div>
  </section>
  <AdminSourceForm v-if="formOpen" :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="false" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" submit-label="Update record" @draft-error="onDraftError"/>
  <div class="record-footer"><button class="text-button" @click="remove(masterRecord)">Delete</button></div>
</div>
</template>
<template v-else>
<div v-if="formOpen" class="admin-record-form-screen">
  <div class="detail-actions"><button class="secondary" type="button" @click="formOpen=false;editing=null">‹ Cancel and return to list</button></div>
  <AdminSourceForm :fields="activeDefinition?.fields||[]" :model-value="draft" :draft-identity="sourceFormDraftIdentity" :busy="saving" :auto-open-first="editing===null" :errors="formErrors" @field-change="onSourceFieldChange" @submit="save" @cancel="formOpen=false;editing=null" @draft-error="onDraftError" :submit-label="editing!==null?'Update record':'Save record'"/>
</div>
<template v-else>
<div class="admin-list-tools"><label class="admin-search-field"><span aria-hidden="true">⌕</span><input v-model="recordSearch" type="search" :placeholder="'Search '+currentItem.title.toLowerCase()+' records…'" :aria-label="'Search '+currentItem.title+' records'"></label><span class="admin-search-hint">{{filteredRecords.length}} {{filteredRecords.length===1?'record':'records'}}<template v-if="recordSearch"> found</template></span></div>
<div class="detail-actions"><button class="primary" @click="add">＋ Create {{currentDefinition?.createLabel||currentItem.title}}</button></div><div v-if="loading&&!records.length" class="empty">Loading…</div><div v-else-if="filteredRecords.length" class="record-list"><article v-for="record in filteredRecords" :key="record.id" class="clean-card record-card"><div class="record-top"><div><strong>{{label(selected,record)}}</strong><span>{{record.updatedAt||'—'}}</span></div><button class="text-button" :aria-label="`Edit ${label(selected,record)}`" @click="edit(record)">Edit</button></div><div class="record-footer"><button class="text-button" :aria-label="`Delete ${label(selected,record)}`" @click="remove(record)">Delete</button></div></article></div><div v-else-if="!loading" class="empty">{{recordSearch ? 'No '+currentItem.title.toLowerCase()+' records match your search.' : 'No records yet. Create the first record to get started.'}}</div>
</template>
</template>
</section>
</template>
</AdminShell>
</template>


