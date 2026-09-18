<script setup>
import { onMounted, ref } from 'vue'
import { SyntheticDataService } from '../../application/synthetic/syntheticDataService.js'
import { getActiveDataSource } from '../../utils/indexedDB.js'

const status = ref(null)
const active = ref(getActiveDataSource())
const loading = ref(false)
const message = ref('')
const error = ref('')

const refresh = async () => {
  status.value = await SyntheticDataService.getSyntheticDataStatus()
  active.value = getActiveDataSource()
}
const load = async key => {
  loading.value = true; message.value = ''; error.value = ''
  try {
    const result = await SyntheticDataService.loadSyntheticStage(key)
    message.value = result.stage + ' synthetic dataset loaded. KFE is now using the isolated synthetic database.'
    await refresh()
    window.setTimeout(() => window.location.reload(), 350)
  } catch (e) { error.value = e.message || 'Synthetic data load failed.' } finally { loading.value = false }
}
const clear = async () => {
  if (!confirm('Clear the isolated synthetic dataset and return to the real KFE database?')) return
  loading.value = true; message.value = ''; error.value = ''
  try {
    await SyntheticDataService.clearSyntheticData()
    message.value = 'Synthetic dataset cleared. Real KFE data is active again.'
    await refresh()
    window.setTimeout(() => window.location.reload(), 350)
  } catch (e) { error.value = e.message || 'Synthetic data clear failed.' } finally { loading.value = false }
}
onMounted(refresh)
</script>

<template>
<section class="synthetic-panel" aria-label="Synthetic test data">
  <div class="head"><div><div class="label">TEST DATA ONLY</div><h2>Synthetic Data</h2><p>This dataset lives in a separate IndexedDB database. It is never included in KFE backup or cloud backup.</p></div><span :class="['mode',active==='synthetic'?'on':'']">{{active==='synthetic'?'SYNTHETIC':'REAL DATA'}}</span></div>
  <div class="stages">
    <button v-for="stage in SyntheticDataService.SYNTHETIC_STAGES" :key="stage.key" :disabled="loading" @click="load(stage.key)">{{stage.title}}</button>
  </div>
  <div v-if="status" class="status">Loaded through {{status.endDate}} · {{status.days}} days</div>
  <div class="actions"><button class="danger" :disabled="loading || !status" @click="clear">Clear synthetic data</button></div>
  <p v-if="message" class="notice">{{message}}</p><p v-if="error" class="error">{{error}}</p>
</section>
</template>

<style scoped>
.synthetic-panel{margin-top:10px;padding:12px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:12px;background:#fff}.head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.label{font-size:.58rem;font-weight:900;letter-spacing:.12em;color:#667085}.head h2{margin:3px 0;font-size:.9rem}.head p{margin:3px 0 0;color:#667085;font-size:.62rem;line-height:1.4}.mode{padding:5px 7px;border-radius:999px;background:#f2f4f7;color:#667085;font-size:.55rem;font-weight:900;white-space:nowrap}.mode.on{background:#ecfdf3;color:#027a48}.stages{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:10px}.stages button,.actions button{min-height:34px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;font-size:.58rem;font-weight:800;cursor:pointer}.stages button:disabled,.actions button:disabled{opacity:.5;cursor:wait}.actions{margin-top:7px}.danger{color:#b42318;border-color:#fda29b!important}.status{margin-top:8px;padding:7px;border-radius:7px;background:#f8fafc;color:#667085;font-size:.58rem}.notice,.error{margin:8px 0 0;padding:7px;border-radius:7px;font-size:.6rem}.notice{background:#ecfdf3;color:#027a48}.error{background:#fef3f2;color:#b42318}@media(max-width:600px){.stages{grid-template-columns:repeat(3,1fr)}}
</style>
