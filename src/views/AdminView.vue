<script setup>
import { computed, onMounted, ref, toRaw } from 'vue'
import UniversalAdminForm from '../components/admin/UniversalAdminForm.vue'
import BackupRestorePanel from '../components/admin/BackupRestorePanel.vue'
import SyntheticDataPanel from '../components/admin/SyntheticDataPanel.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'
import { BackupService } from '../application/backup/backupService.js'
import { LoanReadModelService } from '../application/admin/loanReadModelService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { getKfeReferenceNow } from '../domain/time/ist.js'
import { getKfeThemeSettings, setKfeThemeMode } from '../presentation/theme/kfeThemeController.js'

const groups=[
 {key:'businessSetup',title:'Business Setup',icon:'◉',forms:['vehicle','driver'],description:'Core vehicle and driver master data.'},
 {key:'vehicleRecords',title:'Vehicle Records',icon:'▣',forms:['compliance','maintenance'],description:'Vehicle compliance and maintenance records.'},
 {key:'finance',title:'Finance',icon:'₹',forms:['loan','loanPayment','prepayment'],description:'Loans and actual financing movements.'},
 {key:'planningControls',title:'Planning & Controls',icon:'⌁',forms:['driverTarget','breakEvenInputs'],description:'Effective-dated targets and break-even inputs.'}
]
const settingsMenu=[
 {key:'backup',title:'Backup & Restore',subtitle:'Protect and recover complete KFE data',icon:'↥'},
 {key:'application',title:'Application Settings',subtitle:'Application-level preferences and controls',icon:'⚙'},
 {key:'reset',title:'Data Reset',subtitle:'Clear the canonical KFE dataset',icon:'⚠'},
 {key:'synthetic',title:'Synthetic Data',subtitle:'Isolated test dataset only',icon:'🧪'}
]
const adminSection=ref('records'),selected=ref('vehicle'),settingsSelected=ref('backup'),categoryTouchStartX=ref(null)
const themeSettings=ref(getKfeThemeSettings())
const records=ref([]),editing=ref(null),draft=ref({}),formOpen=ref(false),loading=ref(false),error=ref(''),notice=ref('')
const money=value=>Number.isFinite(Number(value))?`₹${Number(value).toLocaleString('en-IN',{maximumFractionDigits:2})}`:'—'
const cloneForForm=value=>structuredClone(toRaw(value))
const all=ref({vehicle:[],driver:[],loan:[]})
const loanReadModel=ref({loans:[]})
const performanceSnapshot=ref(null)
const breakEvenPreview=ref(null)
const currentGroup=computed(()=>groups.find(g=>g.forms.includes(selected.value))||groups[0])
const baseDefinition=computed(()=>ADMIN_FORM_DEFINITIONS[selected.value])
const activeDefinition=computed(()=>{const d=cloneForForm(baseDefinition.value);for(const f of d.fields){if(f.key==='vehicleId')f.options=all.value.vehicle.map(x=>x.id);if(f.key==='driverId')f.options=all.value.driver.map(x=>x.id);if(f.key==='loanId')f.options=all.value.loan.map(x=>x.id)}return d})
function label(key,record){const v=record.values||record;if(key==='vehicle')return [v.registrationNumber,v.make,v.model].filter(Boolean).join(' · ')||record.id;if(key==='driver')return v.name||record.id;if(key==='loan')return [v.lender,v.accountReference].filter(Boolean).join(' · ')||record.id;return record.id}
function display(value){for(const k of ['vehicle','driver','loan']){const found=all.value[k].find(x=>x.id===value);if(found)return label(k,found)}return value}
async function load(){loading.value=true;error.value='';try{records.value=await AdminService.list(selected.value);for(const k of Object.keys(all.value))all.value[k]=await AdminService.list(k);loanReadModel.value=await LoanReadModelService.getLoanReadModel(getKfeReferenceNow());performanceSnapshot.value=await PerformanceService.getSnapshot()}catch(e){error.value=e.message||'Unable to load records.'}finally{loading.value=false}}
function choose(key){selected.value=key;editing.value=null;draft.value={};formOpen.value=false;notice.value='';load()}
function chooseGroup(group){choose(group.forms[0])}
function onCategoryTouchStart(event){categoryTouchStartX.value=event.changedTouches?.[0]?.clientX ?? null}
function onCategoryTouchEnd(event){const start=categoryTouchStartX.value;categoryTouchStartX.value=null;if(start===null)return;const end=event.changedTouches?.[0]?.clientX ?? start;const delta=end-start;if(Math.abs(delta)<45)return;const current=groups.findIndex(g=>g.key===currentGroup.value.key);const next=delta<0?Math.min(groups.length-1,current+1):Math.max(0,current-1);if(next!==current)chooseGroup(groups[next])}
function openRecords(){adminSection.value='records';error.value='';notice.value=''}
function openSettings(){adminSection.value='settings';formOpen.value=false;editing.value=null;draft.value={};error.value='';notice.value=''}
function chooseSetting(key){settingsSelected.value=key;error.value='';notice.value=''}
function chooseTheme(mode){themeSettings.value={...themeSettings.value,mode};setKfeThemeMode(mode);notice.value=`Theme set to ${mode==='light'?'Light':mode==='dark'?'Dark':'Auto'}.`}
function add(){editing.value=null;draft.value={};formOpen.value=true}
function edit(record){editing.value=record.id;draft.value=cloneForForm(record.values||{});formOpen.value=true}
const breakEvenPreviewMetrics=computed(()=>{if(selected.value!=='breakEvenInputs'||!performanceSnapshot.value)return null;const now=getKfeReferenceNow();return PerformanceService.getMetrics(performanceSnapshot.value,{from:new Date(now.getFullYear(),now.getMonth(),1),to:now})})
const previewRows=computed(()=>{const m=breakEvenPreviewMetrics.value;if(!m)return [];return [['Monthly break-even',money(m.monthlyBreakEvenRevenue)],['Fixed costs',money(m.breakEvenInputs?.fixedCosts)],['Fuel cost / km',Number.isFinite(Number(m.breakEvenInputs?.fuelCostPerKm))?`₹${Number(m.breakEvenInputs.fuelCostPerKm).toFixed(2)}`:'—'],['Vehicle km',Number.isFinite(Number(m.vehicleKm))?`${Number(m.vehicleKm).toLocaleString('en-IN',{maximumFractionDigits:1})} km`:'—'],['Maintenance provision / km',Number.isFinite(Number(m.breakEvenInputs?.maintenanceProvisionPerKm))?`₹${Number(m.breakEvenInputs.maintenanceProvisionPerKm).toFixed(2)}`:'—']]})
async function save(values){loading.value=true;error.value='';notice.value='';try{const id=editing.value;await AdminService.save(selected.value,values,id);notice.value=id!==null?'Record updated successfully.':`${baseDefinition.value?.createLabel||baseDefinition.value?.title||'Record'} created successfully.`;editing.value=null;draft.value={};formOpen.value=false;await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Save failed.'}finally{loading.value=false}}
async function remove(record){if(!confirm('Delete this source record? Related records may prevent deletion.'))return;loading.value=true;error.value='';try{await AdminService.remove(selected.value,record.id);notice.value='Record deleted.';await load()}catch(e){error.value=e.message||'Delete failed.'}finally{loading.value=false}}
async function resetData(){if(!confirm('Reset all KFE data? Create a backup first if you may need the current data.'))return;if(!confirm('Final confirmation: permanently delete all current KFE records?'))return;loading.value=true;error.value='';notice.value='';try{await BackupService.resetData();notice.value='All canonical KFE data has been reset.'}catch(e){error.value=e.message||'Data reset failed.'}finally{loading.value=false}}
onMounted(load)
</script>

<template>
<section class="admin-page" aria-label="Admin">
<header class="admin-head"><div><div class="eyebrow">ADMIN · MASTER CONTROL</div><h1>Admin</h1></div><button class="settings-link" :class="{active:adminSection==='settings'}" @click="adminSection==='settings'?openRecords():openSettings()" aria-label="Settings and Data"><span>⚙</span><strong>Settings &amp; Data</strong></button></header>
<template v-if="adminSection==='records'">
<nav class="category-slider" aria-label="Business control categories" @touchstart="onCategoryTouchStart" @touchend="onCategoryTouchEnd"><button v-for="group in groups" :key="group.key" class="category-tab" :class="{active:currentGroup.key===group.key}" @click="chooseGroup(group)"><span class="category-icon">{{group.icon}}</span><span>{{group.title}}</span></button></nav>
<section class="workspace"><div class="workspace-head"><div><div class="section-label">{{currentGroup.title}}</div><h2>{{baseDefinition.title}}</h2><p>{{currentGroup.description}}</p></div><button class="primary" @click="add">＋ Create {{baseDefinition.createLabel||baseDefinition.title}}</button></div>
<nav class="record-tabs" :aria-label="currentGroup.title"><button v-for="key in currentGroup.forms" :key="key" :class="{active:selected===key}" @click="choose(key)">{{ADMIN_FORM_DEFINITIONS[key].collectionTitle||ADMIN_FORM_DEFINITIONS[key].title}}</button></nav>
<p v-if="error" class="message error">{{error}}</p><p v-if="notice" class="message notice">✓ {{notice}}</p>
<UniversalAdminForm v-if="formOpen" :definition="activeDefinition" :model-value="draft" @update:model-value="draft=$event" @submit="save" @cancel="formOpen=false;editing=null;draft={}" :submit-label="editing!==null?'Update record':'Save record'" />
<div v-if="formOpen && selected==='breakEvenInputs'" class="breakeven-preview" aria-label="Current calculated break-even preview"><div class="section-label">DERIVED · READ ONLY</div><h3>Current calculated break-even</h3><p>These values come from KFE's authoritative records; only maintenance provision per km is configured above.</p><div class="metric-grid"><div v-for="row in previewRows" :key="row[0]"><span>{{row[0]}}</span><strong>{{row[1]}}</strong></div></div></div>
<div v-else-if="loading" class="empty"><span class="spinner"></span><strong>Loading records…</strong></div>
<div v-else-if="records.length" class="record-list"><article v-for="record in records" :key="record.id" class="record"><div><div class="record-title"><strong>{{label(selected,record)}}</strong><span>Authoritative source</span></div><small>Updated {{record.updatedAt||'—'}}</small><div class="chips"><span v-for="(value,key) in record.values" v-if="value!==''&&value!==null&&value!==undefined&&key!=='notes'" :key="key">{{display(value)}}</span></div><div v-if="selected==='loan'&&loanReadModel.loans.find(x=>x.loan.id===record.id)" class="loan-status"><span>Overdue</span><strong>{{money(loanReadModel.loans.find(x=>x.loan.id===record.id).overdueAmount)}}</strong><small>{{loanReadModel.loans.find(x=>x.loan.id===record.id).overdueCount}} unpaid installment{{loanReadModel.loans.find(x=>x.loan.id===record.id).overdueCount===1?'':'s'}}</small><small v-if="loanReadModel.loans.find(x=>x.loan.id===record.id).nextDueDate">Next due {{loanReadModel.loans.find(x=>x.loan.id===record.id).nextDueDate.slice(0,10)}}</small></div></div><div class="actions"><button @click="edit(record)">Edit</button><button class="delete" @click="remove(record)">Delete</button></div></article></div>
<div v-else class="empty"><div class="empty-icon">＋</div><strong>No {{baseDefinition.collectionTitle||baseDefinition.title}} records yet</strong><span>Create the first authoritative source record for this section.</span></div></section>
</template>
<template v-else>
<section class="settings-layout"><aside class="settings-menu"><div class="section-label">SETTINGS &amp; DATA</div><h2>Control centre</h2><button v-for="item in settingsMenu" :key="item.key" :class="{active:settingsSelected===item.key}" @click="chooseSetting(item.key)"><span class="settings-icon">{{item.icon}}</span><span><strong>{{item.title}}</strong><small>{{item.subtitle}}</small></span><b>›</b></button></aside>
<section v-if="settingsSelected==='backup'" class="settings-workspace"><div class="settings-heading"><div><div class="section-label">DATA PROTECTION</div><h2>Backup &amp; Restore</h2><p>One managed backup contains the complete recoverable KFE dataset, including settings.</p></div><span class="status">Protected</span></div><BackupRestorePanel /></section>
<section v-else-if="settingsSelected==='application'" class="settings-workspace"><div class="settings-heading"><div><div class="section-label">APPLICATION SETTINGS</div><h2>Application Settings</h2><p>Application-level preferences belong here rather than being mixed into business records.</p></div><span class="status">Settings</span></div><div class="info-card"><strong>Appearance</strong><p>Choose the display mode for the KFE interface. Auto follows the configured day/night schedule.</p><div class="theme-selector" role="group" aria-label="Theme mode"><button type="button" :class="{active:themeSettings.mode==='light'}" :aria-pressed="themeSettings.mode==='light'" @click="chooseTheme('light')">☀ Light</button><button type="button" :class="{active:themeSettings.mode==='dark'}" :aria-pressed="themeSettings.mode==='dark'" @click="chooseTheme('dark')">☾ Dark</button><button type="button" :class="{active:themeSettings.mode==='auto'}" :aria-pressed="themeSettings.mode==='auto'" @click="chooseTheme('auto')">◐ Auto</button></div></div><div class="info-card"><strong>Settings travel with backup and restore</strong><p>KFE application settings are part of the canonical backup/restore boundary. Backup/sync provider configuration remains separate from portable business data.</p></div></section>
<section v-else-if="settingsSelected==='synthetic'" class="settings-workspace"><div class="settings-heading"><div><div class="section-label">TEST DATA ONLY</div><h2>Test Data Reset</h2><p>Temporary development control for isolated synthetic data. It never touches the real KFE database or backup boundary.</p></div><span class="status">Temporary</span></div><SyntheticDataPanel /></section>
<section v-else class="settings-workspace"><div class="settings-heading"><div><div class="section-label">DESTRUCTIVE DATA CONTROL</div><h2>Data Reset</h2><p>Permanently clear the canonical KFE dataset. The application itself remains installed.</p></div><span class="status danger">Destructive</span></div><div class="reset-card"><div><h2>Reset all KFE data</h2><p>This clears canonical business records. Local backup copies are not deleted, so a backup can be restored afterward.</p></div><button class="reset-button" :disabled="loading" @click="resetData">Reset all data</button></div><p v-if="error" class="message error">{{error}}</p><p v-if="notice" class="message notice">✓ {{notice}}</p></section></section>
</template>
</section>
</template>

