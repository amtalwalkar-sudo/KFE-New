<script setup>
import { computed, onMounted, ref } from 'vue';
import KfeFormShell from './KfeFormShell.vue';
const props=defineProps({application:{type:Object,required:true}});
const emit = defineEmits(['save-request', 'back']);
const editing = ref(false);const detail = ref('');const model=ref(null);
const initial = { type: '', cost: '', start: '', end: '' };
const records=computed(()=>model.value?.complianceRecords||[]);
async function load(){try{model.value=await props.application.getAdminState();}catch{model.value=null;}}
function save(value) { emit('save-request', { module: 'Compliance', value }); }
async function openDetail(value) { detail.value = value; await load(); }
function closeDetail() { detail.value = ''; }
onMounted(load);
</script>
<template>
  <section class="kfe-module-view" aria-labelledby="compliance-title">
    <button class="kfe-secondary-action" type="button" @click="detail ? closeDetail() : editing ? editing = false : emit('back')">‹ {{ detail ? 'Compliance' : editing ? 'Compliance' : 'More' }}</button>
    <template v-if="detail">
      <p class="kfe-eyebrow">Vehicle Operations</p>
      <h1 id="compliance-title">{{ detail === 'history' ? 'Renewal history' : 'Current validity' }}</h1>
      <article class="kfe-detail-card">
        <strong>{{ detail === 'history' ? 'Authoritative renewal history' : 'Current validity records' }}</strong>
        <div v-if="records.length" class="kfe-module-list"><article v-for="row in records" :key="row.id" class="kfe-detail-card"><strong>{{ row.renewal_type || row.type || row.name || 'Renewal' }}{{ detail==='validity' ? ' · ' + (String(row.validity_end || row.end || row.valid_to || '') >= new Date().toISOString().slice(0,10) ? 'VALID' : 'EXPIRED') : '' }}</strong><p>{{ row.validity_start || row.start || row.valid_from || row.business_date || row.date }} → {{ row.validity_end || row.end || row.valid_to || 'No end date' }}<span v-if="row.cost_paise!=null"> · ₹{{ (Number(row.cost_paise)/100).toFixed(2) }}</span></p></article></div>
        <p v-else>No compliance records recorded.</p>
      </article>
    </template>
    <template v-else-if="!editing">
      <p class="kfe-eyebrow">Vehicle Operations</p><h1 id="compliance-title">Compliance</h1><p class="kfe-destination-subtitle">Renewals, validity and historical records.</p>
      <article class="kfe-action-card"><div><span class="kfe-card-label">Renewal</span><strong>Record a completed renewal</strong><p>Keep renewal type, cost and validity dates clear.</p></div><button class="kfe-primary-action" type="button" @click="editing = true">Add renewal</button></article>
      <section class="kfe-module-section"><h2>Current validity</h2><button class="kfe-list-action" type="button" @click="openDetail('validity')"><span>Current validity</span><span aria-hidden="true">›</span></button></section>
      <section class="kfe-module-section"><h2>History</h2><button class="kfe-list-action" type="button" @click="openDetail('history')"><span>Renewal history</span><span aria-hidden="true">›</span></button></section>
    </template>
    <KfeFormShell v-else draft-key="compliance-renewal" title="Add renewal" subtitle="Record a completed renewal." :initial-value="initial" @save="save">
      <template #default="{ value }">
        <div class="kfe-form-field"><label class="kfe-form-label" for="renewal-type"><span>Renewal type</span><span class="kfe-required">Required</span></label><input id="renewal-type" v-model="value.type" class="kfe-form-input" type="text" placeholder="e.g. Insurance" required /></div>
        <div class="kfe-form-field"><label class="kfe-form-label" for="renewal-cost"><span>Cost</span><span class="kfe-required">Required</span></label><input id="renewal-cost" v-model="value.cost" class="kfe-form-input" type="number" inputmode="decimal" min="0" step="0.01" required /></div>
        <div class="kfe-form-grid"><div class="kfe-form-field"><label class="kfe-form-label" for="renewal-start"><span>Validity start</span><span class="kfe-required">Required</span></label><input id="renewal-start" v-model="value.start" class="kfe-form-input" type="date" required /></div><div class="kfe-form-field"><label class="kfe-form-label" for="renewal-end"><span>Validity end</span><span class="kfe-required">Required</span></label><input id="renewal-end" v-model="value.end" class="kfe-form-input" type="date" required /></div></div>
        <p class="kfe-form-boundary-note">Save submits the completed renewal to the application boundary. No separate payment-status business state is created.</p>
      </template>
    </KfeFormShell>
  </section>
</template>
