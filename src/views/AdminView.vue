<script setup>
import { computed, onMounted, ref } from 'vue'
import UniversalAdminForm from '../components/admin/UniversalAdminForm.vue'
import BackupRestorePanel from '../components/admin/BackupRestorePanel.vue'
import { ADMIN_FORM_DEFINITIONS } from '../application/admin/adminFormDefinitions.js'
import { AdminService } from '../application/admin/adminService.js'
import { BackupService } from '../application/backup/backupService.js'

const groups = [
  { key: 'operations', title: 'Operations', icon: '◉', forms: ['vehicle', 'driver', 'compliance', 'maintenance', 'driverCollectedData'] },
  { key: 'finance', title: 'Finance', icon: '₹', forms: ['loan', 'loanPayment', 'prepayment'] },
  { key: 'targetBreakEven', title: 'Planning', icon: '⌁', forms: ['driverTarget', 'breakEvenInputs'] }
]
const settingsMenu = [
  { key: 'backup', title: 'Backup & Restore', subtitle: 'Protect and recover your KFE data', icon: '↥' },
  { key: 'calculations', title: 'ERP Calculations', subtitle: 'Calculation rules and derived metrics', icon: '∑' },
  { key: 'reset', title: 'Data Reset', subtitle: 'Clear the canonical KFE dataset', icon: '⚠' }
]
const adminSection = ref('records')
const selected = ref('vehicle')
const settingsSelected = ref('backup')
const records = ref([])
const editing = ref(null)
const draft = ref({})
const formOpen = ref(false)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const baseDefinition = computed(() => ADMIN_FORM_DEFINITIONS[selected.value])
const currentGroup = computed(() => groups.find(group => group.forms.includes(selected.value)))
const all = ref({ vehicle: [], driver: [], loan: [] })
const activeDefinition = computed(() => {
  const definition = structuredClone(baseDefinition.value)
  for (const field of definition.fields) {
    if (field.key === 'vehicleId') field.options = all.value.vehicle.map(item => item.id)
    if (field.key === 'driverId') field.options = all.value.driver.map(item => item.id)
    if (field.key === 'loanId') field.options = all.value.loan.map(item => item.id)
  }
  return definition
})
function label(key, record) {
  const value = record.values || record
  return key === 'vehicle'
    ? [value.registrationNumber, value.make, value.model].filter(Boolean).join(' · ') || record.id
    : key === 'driver'
      ? value.name || record.id
      : key === 'loan'
        ? [value.lender, value.accountReference].filter(Boolean).join(' · ') || record.id
        : record.id
}
function display(value) {
  for (const key of ['vehicle', 'driver', 'loan']) {
    const found = all.value[key].find(item => item.id === value)
    if (found) return label(key, found)
  }
  return value
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    records.value = await AdminService.list(selected.value)
    for (const key of Object.keys(all.value)) all.value[key] = await AdminService.list(key)
  } catch (e) {
    error.value = e.message || 'Unable to load records.'
  } finally {
    loading.value = false
  }
}
function choose(key) {
  selected.value = key
  editing.value = null
  draft.value = {}
  formOpen.value = false
  notice.value = ''
  load()
}
function chooseGroup(group) { choose(group.forms[0]) }
function openRecords() { adminSection.value = 'records'; notice.value = ''; error.value = '' }
function openSettings() { adminSection.value = 'settings'; formOpen.value = false; editing.value = null; draft.value = {}; notice.value = ''; error.value = '' }
function chooseSetting(key) { settingsSelected.value = key; error.value = ''; notice.value = '' }
function add() { editing.value = null; draft.value = {}; formOpen.value = true }
function edit(record) { editing.value = record.id; draft.value = structuredClone(record.values || {}); formOpen.value = true }
async function save(values) {
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    await AdminService.save(selected.value, values, editing.value)
    notice.value = editing.value !== null ? 'Record updated successfully.' : 'Record created successfully.'
    editing.value = null
    draft.value = {}
    formOpen.value = false
    await load()
  } catch (e) {
    error.value = e.validation ? Object.values(e.validation).join(' ') : e.message || 'Save failed.'
  } finally {
    loading.value = false
  }
}
async function remove(record) {
  if (!confirm('Delete this source record? Related records may prevent deletion.')) return
  loading.value = true
  error.value = ''
  try {
    await AdminService.remove(selected.value, record.id)
    notice.value = 'Record deleted.'
    await load()
  } catch (e) {
    error.value = e.message || 'Delete failed.'
  } finally {
    loading.value = false
  }
}
async function resetData() {
  if (!confirm('Reset all KFE data? This permanently clears the canonical dataset. Create a backup first if you may need the current data.')) return
  if (!confirm('Final confirmation: permanently delete all current KFE records?')) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    await BackupService.resetData()
    notice.value = 'All canonical KFE data has been reset.'
  } catch (e) {
    error.value = e.message || 'Data reset failed.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
<section class="admin-page" aria-label="Admin">
  <header class="admin-head">
    <div><div class="eyebrow">ADMIN · CONTROL CENTRE</div><h1>Admin</h1><p>Manage authoritative source records and protected application settings.</p></div>
    <div class="admin-badge"><span>●</span> Controlled data</div>
  </header>

  <nav class="admin-nav" aria-label="Admin menu">
    <button :class="{ active: adminSection === 'records' }" @click="openRecords"><span>▦</span><strong>Records</strong></button>
    <button :class="{ active: adminSection === 'settings' }" @click="openSettings"><span>⚙</span><strong>Settings</strong></button>
  </nav>

  <template v-if="adminSection === 'records'">
    <nav class="group-swipe" aria-label="Admin record sections">
      <button v-for="group in groups" :key="group.key" class="group-tab" :class="{ active: currentGroup?.key === group.key }" @click="chooseGroup(group)">
        <span>{{ group.icon }}</span><strong>{{ group.title }}</strong>
      </button>
    </nav>

    <section class="workspace">
      <div class="workspace-head">
        <div><div class="section-label">{{ currentGroup?.title }}</div><h2>{{ baseDefinition.title }}</h2></div>
        <button class="primary" @click="add"><span>＋</span> New record</button>
      </div>

      <nav class="record-tabs" :aria-label="`${currentGroup?.title} sub menu`">
        <button v-for="key in currentGroup.forms" :key="key" :class="{ active: selected === key }" @click="choose(key)">{{ ADMIN_FORM_DEFINITIONS[key].title }}</button>
      </nav>

      <p v-if="error" class="message error">{{ error }}</p>
      <p v-if="notice" class="message notice">✓ {{ notice }}</p>

      <UniversalAdminForm v-if="formOpen" :definition="activeDefinition" :model-value="draft" @update:model-value="draft = $event" @submit="save" @cancel="formOpen = false; editing = null; draft = {}" :submit-label="editing !== null ? 'Update record' : 'Save record'" />
      <div v-else-if="loading" class="empty-state"><span class="spinner"></span><strong>Loading records…</strong></div>
      <div v-else-if="records.length" class="record-list">
        <article v-for="record in records" :key="record.id" class="record">
          <div class="record-main"><div class="record-title"><strong>{{ label(selected, record) }}</strong><span class="record-status">Source record</span></div><small>Updated {{ record.updatedAt || '—' }}</small><div class="chips"><span v-for="(value, key) in record.values" v-if="value !== '' && value !== null && value !== undefined && key !== 'notes'" :key="key">{{ display(value) }}</span></div></div>
          <div class="actions"><button @click="edit(record)">Edit</button><button class="delete" @click="remove(record)">Delete</button></div>
        </article>
      </div>
      <div v-else class="empty-state"><div class="empty-icon">＋</div><strong>No {{ baseDefinition.title }} records yet</strong><span>Create the first authoritative source record for this section.</span><button class="primary" @click="add">Create {{ baseDefinition.title }}</button></div>
    </section>
  </template>

  <template v-else>
    <section class="settings-layout">
      <aside class="settings-menu" aria-label="Settings menu">
        <div class="section-label">SETTINGS</div><h2>Application settings</h2>
        <button v-for="item in settingsMenu" :key="item.key" :class="{ active: settingsSelected === item.key }" @click="chooseSetting(item.key)"><span class="settings-icon">{{ item.icon }}</span><span><strong>{{ item.title }}</strong><small>{{ item.subtitle }}</small></span><b>›</b></button>
      </aside>
      <section v-if="settingsSelected === 'backup'" class="settings-workspace">
        <div class="settings-heading"><div><div class="section-label">DATA PROTECTION</div><h2>Backup &amp; Restore</h2><p>Manage the complete KFE backup and recovery workflow from one place.</p></div><span class="settings-status">Protected</span></div>
        <BackupRestorePanel />
      </section>
      <section v-else-if="settingsSelected === 'calculations'" class="settings-workspace">
        <div class="settings-heading"><div><div class="section-label">CALCULATION AUTHORITY</div><h2>ERP Calculations</h2><p>Calculation rules and derived metrics are produced from authoritative records.</p></div><span class="settings-status">Automatic</span></div>
        <div class="derived"><div class="section-label">CALCULATED AUTOMATICALLY</div><h2>Derived ERP metrics</h2><p>Vehicle KM, Business KM, Dead KM, mileage, revenue/KM, revenue/hour, cost/KM, profit, break-even result, achievement, pace, projection and provision totals are calculated from authoritative records.</p></div>
      </section>
      <section v-else class="settings-workspace reset-workspace">
        <div class="settings-heading"><div><div class="section-label">DESTRUCTIVE DATA CONTROL</div><h2>Data Reset</h2><p>Permanently clear the canonical KFE dataset. This does not remove the application itself.</p></div><span class="settings-status danger-status">Destructive</span></div>
        <div class="reset-card">
          <div class="reset-icon">⚠</div>
          <div><h2>Reset all KFE data</h2><p>This clears all authoritative records in the canonical database. Local backup copies are not deleted, so you can restore from a backup afterward if required.</p></div>
          <button class="reset-button" :disabled="loading" @click="resetData">Reset all data</button>
        </div>
        <p v-if="error" class="message error">{{ error }}</p>
        <p v-if="notice" class="message notice">✓ {{ notice }}</p>
      </section>
    </section>
  </template>
</section>
</template>

<style scoped>
.admin-page{width:min(100%,980px);margin:0 auto;padding:24px 16px 34px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-ui-text,#101828);box-sizing:border-box}.eyebrow,.section-label{font-size:.62rem;font-weight:900;letter-spacing:.13em;color:var(--kfe-muted-text,#667085)}.admin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.admin-head h1{margin:5px 0 4px;font-size:clamp(1.55rem,6vw,2rem);letter-spacing:-.04em}.admin-head p{max-width:650px;margin:0;color:var(--kfe-muted-text,#667085);font-size:.76rem;line-height:1.5}.admin-badge{display:flex;align-items:center;gap:6px;padding:8px 11px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:999px;background:var(--kfe-ui-surface,#fff);font-size:.61rem;font-weight:850;white-space:nowrap}.admin-badge span{color:var(--kfe-success,#079455);font-size:.7rem}.admin-nav{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;margin-bottom:10px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:14px;background:var(--kfe-ui-surface,#fff)}.admin-nav button{min-height:43px;display:flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:10px;background:transparent;color:var(--kfe-muted-text,#667085);cursor:pointer}.admin-nav button span{font-size:.9rem}.admin-nav button strong{font-size:.68rem}.admin-nav button.active{background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb)}.group-swipe{display:flex;gap:7px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:2px 1px 9px;margin-bottom:2px;scrollbar-width:none}.group-swipe::-webkit-scrollbar{display:none}.group-tab{flex:0 0 auto;min-width:118px;min-height:48px;display:flex;align-items:center;justify-content:center;gap:7px;padding:0 14px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:13px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-muted-text,#667085);font-size:.7rem;font-weight:850;scroll-snap-align:start;cursor:pointer;box-shadow:0 3px 12px rgba(16,24,40,.03)}.group-tab span{font-size:.9rem}.group-tab.active{border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 30%,var(--kfe-ui-border,#e4e7ec));background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb)}.workspace,.settings-menu,.settings-workspace,.derived,.boundary{border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:17px;background:var(--kfe-ui-surface,#fff);box-shadow:0 5px 20px rgba(16,24,40,.035)}.workspace{padding:15px}.workspace-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.workspace-head h2,.settings-menu h2,.settings-heading h2,.derived h2{margin:3px 0;font-size:1.08rem;letter-spacing:-.02em}.primary{min-height:40px;display:inline-flex;align-items:center;gap:5px;padding:0 11px;border:0;border-radius:10px;background:var(--kfe-ui-accent,#2563eb);color:#fff;font-size:.66rem;font-weight:900;cursor:pointer}.primary span{font-size:.95rem}.record-tabs{display:flex;gap:6px;overflow-x:auto;margin:12px -2px 4px;padding:0 2px 9px;border-bottom:1px solid var(--kfe-ui-border,#e4e7ec);scrollbar-width:none}.record-tabs::-webkit-scrollbar{display:none}.record-tabs button{min-height:35px;padding:0 10px;border:1px solid transparent;border-radius:9px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.6rem;font-weight:800;white-space:nowrap;cursor:pointer}.record-tabs button.active{background:var(--kfe-accent-soft,#eff6ff);border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 18%,transparent);color:var(--kfe-ui-accent,#2563eb)}.message{margin:10px 0;padding:10px 12px;border-radius:10px;font-size:.7rem}.message.error{background:#fef3f2;color:#b42318}.message.notice{background:#ecfdf3;color:#067647}.record-list{display:grid;gap:8px;margin-top:10px}.record{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:13px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:13px}.record-main{min-width:0}.record-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.record-title strong{font-size:.77rem}.record-status{padding:3px 6px;border-radius:999px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.53rem;font-weight:800}.record-main>small{display:block;margin-top:3px;color:var(--kfe-muted-text,#667085);font-size:.59rem}.chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.chips span{max-width:100%;padding:4px 7px;border-radius:7px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.59rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.actions{display:flex;gap:6px;flex-shrink:0}.actions button{min-height:35px;padding:0 10px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:9px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-ui-text,#101828);font-size:.62rem;font-weight:800;cursor:pointer}.actions button.delete{color:var(--kfe-danger,#d92d20)}.empty-state{min-height:190px;display:flex;align-items:center;justify-content:center;gap:7px;flex-direction:column;text-align:center;color:var(--kfe-muted-text,#667085)}.empty-state strong{color:var(--kfe-ui-text,#101828);font-size:.82rem}.empty-icon{font-size:1.5rem;color:var(--kfe-ui-accent,#2563eb)}.spinner{width:20px;height:20px;border:2px solid var(--kfe-ui-border,#e4e7ec);border-top-color:var(--kfe-ui-accent,#2563eb);border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.derived{margin-top:12px;padding:14px}.derived p{margin:7px 0 0;color:var(--kfe-muted-text,#667085);font-size:.66rem;line-height:1.55}.settings-layout{display:grid;grid-template-columns:240px 1fr;gap:12px}.settings-menu{padding:15px}.settings-menu button{width:100%;margin-top:12px;display:flex;align-items:center;gap:9px;padding:11px;text-align:left;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:11px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-ui-text,#101828);cursor:pointer}.settings-menu button.active{border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 25%,var(--kfe-ui-border,#e4e7ec));background:var(--kfe-accent-soft,#eff6ff)}.settings-menu button span:nth-child(2){display:grid;gap:2px;flex:1}.settings-menu strong{font-size:.66rem}.settings-menu small{font-size:.56rem;color:var(--kfe-muted-text,#667085)}.settings-icon{font-size:1rem}.settings-menu b{color:var(--kfe-muted-text,#667085)}.settings-workspace{padding:15px}.settings-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}.settings-heading p{margin:5px 0 0;color:var(--kfe-muted-text,#667085);font-size:.66rem;line-height:1.5}.settings-status{padding:6px 9px;border-radius:999px;background:#ecfdf3;color:#067647;font-size:.56rem;font-weight:900;white-space:nowrap}.danger-status{background:#fef3f2;color:#b42318}.reset-card{display:grid;gap:12px;padding:15px;border:1px solid #fecdca;border-radius:14px;background:#fffafa}.reset-card h2{margin:0;font-size:.95rem}.reset-card p{margin:5px 0 0;color:var(--kfe-muted-text,#667085);font-size:.67rem;line-height:1.55}.reset-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:#fef3f2;color:#b42318;font-weight:900}.reset-button{justify-self:start;min-height:40px;padding:0 14px;border:0;border-radius:10px;background:#b42318;color:#fff;font-size:.67rem;font-weight:900;cursor:pointer}.reset-button:disabled{opacity:.55;cursor:not-allowed}.boundary{display:flex;gap:10px;align-items:flex-start;margin-top:12px;padding:12px;font-size:.63rem;line-height:1.5;color:var(--kfe-muted-text,#667085)}.boundary strong{color:var(--kfe-ui-text,#101828)}.shield{width:24px;height:24px;display:grid;place-items:center;flex:0 0 24px;border-radius:8px;background:#ecfdf3;color:#067647;font-weight:900}@media(max-width:700px){.admin-page{padding:18px 12px 28px}.admin-head{align-items:center}.admin-head p{display:none}.admin-badge{font-size:.56rem}.group-tab{min-width:112px}.settings-layout{grid-template-columns:1fr}.settings-menu{padding:13px}.settings-workspace{padding:13px}.settings-menu h2{font-size:1rem}.settings-menu button{margin-top:9px}.workspace-head{align-items:flex-start}.workspace-head h2{font-size:1rem}.primary{min-height:38px;padding:0 9px}.record{gap:8px}.actions{flex-direction:column}.boundary{font-size:.6rem}}
</style>