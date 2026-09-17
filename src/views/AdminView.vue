<script setup>
import { computed, onMounted, ref } from 'vue'
import UniversalAdminForm from '../components/admin/UniversalAdminForm.vue'
import BackupRestorePanel from '../components/admin/BackupRestorePanel.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'

const groups = [
  { key:'operations', title:'Operations', subtitle:'Vehicle, people & operating records', icon:'◉', forms:['vehicle','driver','compliance','maintenance','driverCollectedData'] },
  { key:'finance', title:'Finance', subtitle:'Loans & payment records', icon:'₹', forms:['loan','loanPayment','prepayment'] },
  { key:'targetBreakEven', title:'Planning', subtitle:'Driver target & break-even inputs', icon:'⌁', forms:['driverTarget','breakEvenInputs'] }
]
const selected=ref('vehicle'),records=ref([]),editing=ref(null),draft=ref({}),formOpen=ref(false),loading=ref(false),error=ref(''),notice=ref('')
const baseDefinition=computed(()=>ADMIN_FORM_DEFINITIONS[selected.value])
const currentGroup=computed(()=>groups.find(g=>g.forms.includes(selected.value)))
const all=ref({vehicle:[],driver:[],loan:[]})
const activeDefinition=computed(()=>{const d=structuredClone(baseDefinition.value);for(const f of d.fields){if(f.key==='vehicleId')f.options=all.value.vehicle.map(x=>x.id);if(f.key==='driverId')f.options=all.value.driver.map(x=>x.id);if(f.key==='loanId')f.options=all.value.loan.map(x=>x.id)}return d})
function label(key,r){const v=r.values||r;return key==='vehicle'?[v.registrationNumber,v.make,v.model].filter(Boolean).join(' · ')||r.id:key==='driver'?v.name||r.id:key==='loan'?[v.lender,v.accountReference].filter(Boolean).join(' · ')||r.id:r.id}
function display(v){for(const k of ['vehicle','driver','loan']){const found=all.value[k].find(x=>x.id===v);if(found)return label(k,found)}return v}
async function load(){loading.value=true;error.value='';try{records.value=await AdminService.list(selected.value);for(const key of Object.keys(all.value))all.value[key]=await AdminService.list(key)}catch(e){error.value=e.message||'Unable to load records.'}finally{loading.value=false}}
function choose(key){selected.value=key;editing.value=null;draft.value={};formOpen.value=false;notice.value='';load()}
function chooseGroup(group){choose(group.forms[0])}
function add(){editing.value=null;draft.value={};formOpen.value=true}
function edit(r){editing.value=r.id;draft.value=structuredClone(r.values||{});formOpen.value=true}
async function save(values){loading.value=true;error.value='';notice.value='';try{await AdminService.save(selected.value,values,editing.value);notice.value=editing.value!==null?'Record updated successfully.':'Record created successfully.';editing.value=null;draft.value={};formOpen.value=false;await load()}catch(e){error.value=e.validation?Object.values(e.validation).join(' '):e.message||'Save failed.'}finally{loading.value=false}}
async function remove(r){if(!confirm('Delete this source record? Related records may prevent deletion.'))return;loading.value=true;error.value='';try{await AdminService.remove(selected.value,r.id);notice.value='Record deleted.';await load()}catch(e){error.value=e.message||'Delete failed.'}finally{loading.value=false}}
onMounted(load)
</script>

<template>
<section class="admin-page" aria-label="Admin">
  <header class="admin-head">
    <div><div class="eyebrow">ADMIN · CONTROL CENTRE</div><h1>Settings &amp; records</h1><p>Maintain the authoritative source data used by KFE. Calculated ERP values stay outside Admin.</p></div>
    <div class="admin-badge"><span>●</span> Controlled data</div>
  </header>

  <section class="group-grid" aria-label="Admin sections">
    <button v-for="group in groups" :key="group.key" class="group-card" :class="{active:currentGroup?.key===group.key}" @click="chooseGroup(group)">
      <span class="group-icon">{{group.icon}}</span><span class="group-copy"><strong>{{group.title}}</strong><small>{{group.subtitle}}</small></span><b>›</b>
    </button>
  </section>

  <section class="workspace">
    <div class="workspace-head">
      <div><div class="section-label">{{currentGroup?.title}}</div><h2>{{baseDefinition.title}}</h2></div>
      <button class="primary" @click="add"><span>＋</span> New record</button>
    </div>

    <nav class="record-tabs" :aria-label="`${currentGroup?.title} records`">
      <button v-for="key in currentGroup.forms" :key="key" :class="{active:selected===key}" @click="choose(key)">{{ADMIN_FORM_DEFINITIONS[key].title}}</button>
    </nav>

    <p v-if="error" class="message error">{{error}}</p>
    <p v-if="notice" class="message notice">✓ {{notice}}</p>

    <UniversalAdminForm v-if="formOpen" :definition="activeDefinition" :model-value="draft" @update:model-value="draft=$event" @submit="save" @cancel="formOpen=false;editing=null;draft={}" :submit-label="editing!==null?'Update record':'Save record'" />

    <div v-else-if="loading" class="empty-state"><span class="spinner"></span><strong>Loading records…</strong></div>
    <div v-else-if="records.length" class="record-list">
      <article v-for="r in records" :key="r.id" class="record">
        <div class="record-main"><div class="record-title"><strong>{{label(selected,r)}}</strong><span class="record-status">Source record</span></div><small>Updated {{r.updatedAt||'—'}}</small><div class="chips"><span v-for="(v,k) in r.values" v-if="v!==''&&v!==null&&v!==undefined&&k!=='notes'" :key="k">{{display(v)}}</span></div></div>
        <div class="actions"><button @click="edit(r)">Edit</button><button class="delete" @click="remove(r)">Delete</button></div>
      </article>
    </div>
    <div v-else class="empty-state"><div class="empty-icon">＋</div><strong>No {{baseDefinition.title}} records yet</strong><span>Create the first authoritative source record for this section.</span><button class="primary" @click="add">Create {{baseDefinition.title}}</button></div>
  </section>

  <section class="secondary-grid">
    <BackupRestorePanel />
    <section class="derived"><div class="section-label">ERP CALCULATIONS</div><h2>Calculated automatically</h2><p>Vehicle KM, Business KM, Dead KM, mileage, revenue/KM, revenue/hour, cost/KM, profit, break-even result, achievement, pace, projection and provision totals are calculated from authoritative records.</p></section>
  </section>

  <aside class="boundary"><span class="shield">✓</span><span><strong>Controlled boundary</strong><br>Admin manages source records through the Admin application/repository path. Operational execution and ERP calculations remain outside this screen.</span></aside>
</section>
</template>

<style scoped>
.admin-page{width:min(100%,980px);margin:0 auto;padding:24px 16px 34px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-ui-text,#101828);box-sizing:border-box}.eyebrow,.section-label{font-size:.62rem;font-weight:900;letter-spacing:.13em;color:var(--kfe-muted-text,#667085)}.admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.admin-head h1{margin:5px 0 4px;font-size:clamp(1.55rem,6vw,2rem);letter-spacing:-.04em}.admin-head p{max-width:650px;margin:0;color:var(--kfe-muted-text,#667085);font-size:.76rem;line-height:1.5}.admin-badge{display:flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:999px;background:var(--kfe-ui-surface,#fff);font-size:.61rem;font-weight:850;white-space:nowrap}.admin-badge span{color:var(--kfe-success,#079455);font-size:.7rem}.group-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}.group-card{min-height:104px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:14px;text-align:left;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:17px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-ui-text,#101828);box-shadow:0 5px 18px rgba(16,24,40,.035);cursor:pointer}.group-card.active{border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 34%,var(--kfe-ui-border,#e4e7ec));background:var(--kfe-accent-soft,#eff6ff);box-shadow:0 7px 22px rgba(37,99,235,.08)}.group-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-ui-accent,#2563eb);font-weight:950}.group-copy{display:grid;gap:4px}.group-copy strong{font-size:.82rem}.group-copy small{font-size:.61rem;line-height:1.35;color:var(--kfe-muted-text,#667085)}.group-card>b{font-size:1.15rem;color:var(--kfe-muted-text,#667085)}.workspace,.derived,.boundary{border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:18px;background:var(--kfe-ui-surface,#fff);box-shadow:0 6px 22px rgba(16,24,40,.035)}.workspace{padding:15px}.workspace-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.workspace-head h2,.derived h2{margin:3px 0;font-size:1.08rem;letter-spacing:-.02em}.primary{min-height:42px;display:inline-flex;align-items:center;gap:5px;padding:0 12px;border:0;border-radius:11px;background:var(--kfe-ui-accent,#2563eb);color:#fff;font-size:.67rem;font-weight:900;cursor:pointer;box-shadow:0 5px 12px rgba(37,99,235,.16)}.primary span{font-size:1rem}.record-tabs{display:flex;gap:6px;overflow:auto;margin:13px -2px 4px;padding:0 2px 9px;border-bottom:1px solid var(--kfe-ui-border,#e4e7ec)}.record-tabs button{min-height:37px;padding:0 10px;border:1px solid transparent;border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.62rem;font-weight:800;white-space:nowrap;cursor:pointer}.record-tabs button.active{background:var(--kfe-accent-soft,#eff6ff);border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 18%,transparent);color:var(--kfe-ui-accent,#2563eb)}.message{margin:10px 0;padding:10px 12px;border-radius:10px;font-size:.7rem}.message.error{background:#fef3f2;color:#b42318}.message.notice{background:#ecfdf3;color:#067647}.record-list{display:grid;gap:8px;margin-top:10px}.record{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:13px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:13px}.record-main{min-width:0}.record-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.record-title strong{font-size:.77rem}.record-status{padding:3px 6px;border-radius:999px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.53rem;font-weight:800}.record-main>small{display:block;margin-top:3px;color:var(--kfe-muted-text,#667085);font-size:.59rem}.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.chips span{max-width:100%;padding:4px 7px;border-radius:7px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.59rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.actions{display:flex;gap:6px;flex-shrink:0}.actions button{min-height:35px;padding:0 10px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:9px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-ui-text,#101828);font-size:.62rem;font-weight:800;cursor:pointer}.actions button.delete{color:var(--kfe-danger,#d92d20)}.empty-state{min-height:190px;display:flex;align-items:center;justify-content:center;gap:7px;flex-direction:column;text-align:center;color:var(--kfe-muted-text,#667085)}.empty-state strong{color:var(--kfe-ui-text,#101828);font-size:.82rem}.empty-state span:not(.spinner){max-width:320px;font-size:.66rem;line-height:1.4}.empty-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb);font-size:1.3rem;font-weight:900}.empty-state .primary{margin-top:5px}.spinner{width:22px;height:22px;border:3px solid var(--kfe-ui-border,#e4e7ec);border-top-color:var(--kfe-ui-accent,#2563eb);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.secondary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.secondary-grid :deep(.backup-panel){margin-top:0!important}.derived{padding:15px;box-shadow:none}.derived p{margin:7px 0 0;color:var(--kfe-muted-text,#667085);font-size:.67rem;line-height:1.5}.boundary{display:flex;gap:10px;margin-top:12px;padding:12px 14px;box-shadow:none;color:var(--kfe-muted-text,#667085);font-size:.66rem;line-height:1.5}.boundary strong{color:var(--kfe-ui-text,#101828)}.shield{width:25px;height:25px;display:grid;place-items:center;flex:0 0 25px;border-radius:8px;background:#ecfdf3;color:#067647;font-weight:950}@media(max-width:700px){.group-grid{grid-template-columns:1fr}.group-card{min-height:78px}.secondary-grid{grid-template-columns:1fr}.admin-head{align-items:stretch;flex-direction:column}.admin-badge{align-self:flex-start}.workspace-head{align-items:flex-start}.record{flex-direction:column}.actions{justify-content:flex-end;width:100%}}@media(max-width:420px){.admin-page{padding:18px 13px 28px}.workspace{padding:12px}.workspace-head h2{font-size:1rem}.primary{padding:0 10px}.record-tabs button{font-size:.58rem}.record{padding:11px}}
</style>
