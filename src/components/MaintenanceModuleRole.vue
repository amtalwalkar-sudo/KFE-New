<script setup>
import { computed, onMounted, ref } from 'vue';
import KfeFormShell from './KfeFormShell.vue';
const props=defineProps({application:{type:Object,required:true}});
const emit = defineEmits(['save-request', 'back']);
const showForm = ref(false);
const detail = ref('');
const model = ref(null);
const categories = ['Service', 'Tyres', 'Brakes', 'Battery', 'Repair', 'Other'];
const initial = { maintenanceId: '', date: new Date().toISOString().slice(0, 10), vehicle: 'Current vehicle', odometer: '', category: '', description: '', amount: '', expectedKmLife: '', reference: '', workSessionId: '' };
const maintenanceRecords=computed(()=>model.value?.maintenanceRecords||[]);
async function load(){try{model.value=await props.application.getAdminState();}catch{model.value=null;}}
function save(value) { emit('save-request', { module: 'Maintenance', value }); }
function openDetail(value) { detail.value = value; if(value==='history')void load(); }
function closeDetail() { detail.value = ''; }
onMounted(load);
</script>
<template>
  <section class="kfe-module-view" aria-labelledby="maintenance-title">
    <button class="kfe-secondary-action" type="button" @click="detail ? closeDetail() : showForm ? showForm = false : emit('back')">‹ {{ detail ? 'Maintenance' : showForm ? 'Maintenance' : 'More' }}</button>
    <template v-if="detail">
      <p class="kfe-eyebrow">Vehicle Operations</p>
      <h1 id="maintenance-title">{{ detail === 'history' ? 'Maintenance history' : 'Maintenance categories' }}</h1>
      <article v-if="detail === 'history'" class="kfe-detail-card">
        <strong>Authoritative maintenance history</strong>
        <div v-if="maintenanceRecords.length" class="kfe-module-list"><article v-for="row in maintenanceRecords" :key="row.id" class="kfe-detail-card"><strong>{{ row.description || row.category || 'Maintenance record' }}</strong><p>{{ row.date || row.business_date }} · {{ row.category || 'Other' }} · ₹{{ (Number(row.amount_paise??row.cost_paise??0)/100).toFixed(2) }}<span v-if="row.expected_km_life"> · {{ Number(row.expected_km_life).toLocaleString() }} km allocation</span></p></article></div>
        <p v-else>No maintenance records recorded.</p>
      </article>
      <article v-else class="kfe-detail-card"><strong>Maintenance catalogue</strong><p>Supported maintenance categories remain defined by the KFE maintenance model.</p><div class="kfe-module-list"><div v-for="category in categories" :key="category" class="kfe-detail-card"><strong>{{ category }}</strong></div></div></article>
    </template>
    <template v-else-if="!showForm">
      <p class="kfe-eyebrow">Vehicle Operations</p><h1 id="maintenance-title">Maintenance</h1>
      <p class="kfe-destination-subtitle">Vehicle maintenance records and usage context.</p>
      <article class="kfe-action-card"><div><span class="kfe-card-label">Maintenance</span><strong>Record vehicle work</strong><p>Usage-based allocation is handled by the business layer.</p></div><button class="kfe-primary-action" type="button" @click="showForm = true">Add maintenance</button></article>
      <section class="kfe-module-section"><h2>History</h2><button class="kfe-list-action" type="button" @click="openDetail('history')"><span>Maintenance history</span><span aria-hidden="true">›</span></button></section>
      <section class="kfe-module-section"><h2>Catalogue</h2><button class="kfe-list-action" type="button" @click="openDetail('categories')"><span>Maintenance categories</span><span aria-hidden="true">›</span></button></section>
    </template>
    <KfeFormShell v-else draft-key="maintenance-entry" title="Add maintenance" subtitle="Required record information first; supporting links remain optional." :initial-value="initial" @save="save">
      <template #default="{ value }">
        <div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-id"><span>Maintenance ID</span><span class="kfe-optional">Optional</span></label><input id="maintenance-id" v-model="value.maintenanceId" class="kfe-form-input" type="text" placeholder="Assigned by application" /></div>
        <div class="kfe-form-grid"><div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-date"><span>Date</span><span class="kfe-required">Required</span></label><input id="maintenance-date" v-model="value.date" class="kfe-form-input" type="date" required /></div><div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-odometer"><span>Odometer</span><span class="kfe-required">Required</span></label><input id="maintenance-odometer" v-model="value.odometer" class="kfe-form-input" inputmode="numeric" type="number" min="0" step="1" required /></div></div>
        <div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-category"><span>Category</span><span class="kfe-required">Required</span></label><select id="maintenance-category" v-model="value.category" class="kfe-form-input" required><option value="" disabled>Select category</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select></div>
        <div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-description"><span>Description</span><span class="kfe-required">Required</span></label><input id="maintenance-description" v-model="value.description" class="kfe-form-input" type="text" placeholder="What was done?" required /></div>
        <div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-amount"><span>Amount</span><span class="kfe-required">Required</span></label><input id="maintenance-amount" v-model="value.amount" class="kfe-form-input" inputmode="decimal" type="number" min="0" step="0.01" required /></div>
        <details class="kfe-optional-details"><summary>Usage allocation</summary><div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-km-life"><span>Expected usage life</span><span class="kfe-required">Required for KM allocation</span></label><input id="maintenance-km-life" v-model="value.expectedKmLife" class="kfe-form-input" inputmode="numeric" type="number" min="1" step="1" placeholder="e.g. 10000" /><small>Used to spread this maintenance cost across vehicle usage instead of charging the full invoice to one day.</small></div></details>
        <details class="kfe-optional-details"><summary>Optional supporting information</summary><div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-reference"><span>Receipt / reference</span><span class="kfe-optional">Optional</span></label><input id="maintenance-reference" v-model="value.reference" class="kfe-form-input" type="text" /></div><div class="kfe-form-field"><label class="kfe-form-label" for="maintenance-session"><span>Work Session ID</span><span class="kfe-optional">Optional</span></label><input id="maintenance-session" v-model="value.workSessionId" class="kfe-form-input" type="text" /></div></details>
      </template>
    </KfeFormShell>
  </section>
</template>
