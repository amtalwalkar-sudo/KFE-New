<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import KfeStatePanel from './KfeStatePanel.vue';

const props = defineProps({ module: { type: String, required: true }, application: { type: Object, required: true } });
const emit = defineEmits(['back', 'open']);
const profitabilityViews = ['Actual', 'Projected', 'Target', 'Break-even'];
const selectedView = ref('Actual');
const selectedDetail = ref('');
const model = ref(null);
const loading = ref(false);
const error = ref('');

const isProfitability = computed(() => props.module === 'Profitability');
const money = value => value == null ? 'Unavailable' : `₹${(Number(value) / 100).toFixed(2)}`;
const km = value => value == null ? 'Unavailable' : `${Number(value).toFixed(0)} km`;
const definition = computed(() => props.module === 'Profitability'
  ? { eyebrow: 'Business', title: 'Profitability', subtitle: 'Decision-oriented financial interpretation from authoritative calculations.' }
  : { eyebrow: 'Business', title: 'Dashboard', subtitle: 'Actual business performance — what actually happened.' });

async function load() {
  loading.value = true; error.value = '';
  try { model.value = isProfitability.value ? await props.application.getAdminState() : await props.application.getPerformance(); }
  catch (e) { error.value = String(e?.message || e); model.value = null; }
  finally { loading.value = false; }
}

const metrics = computed(() => {
  const m = model.value || {};
  if (isProfitability.value) {
    return [
      ['Revenue', money(m.month?.revenuePaise)],
      ['Business Cost', money(m.month?.costsPaise)],
      ['Profit', money(m.month?.profitPaise)],
      ['Profit / KM', money(m.profitability?.profitPerKmPaise)],
      ['Cost / KM', money(m.profitability?.costPerKmPaise)],
      ['Break-even', money(m.breakEven?.breakEvenPaise)],
    ];
  }
  return [
    ['Revenue', money(m.revenuePaise)],
    ['Running Cost', money(m.runningCostPaise)],
    ['Balance', money(m.balancePaise)],
    ['Business KM', km(m.businessKm)],
    ['Revenue / KM', money(m.revenuePerKmPaise)],
    ['Running Cost / KM', money(m.runningCostPerKmPaise)],
  ];
});

const transparencyItems = computed(() => isProfitability.value
  ? [
      ['Revenue', 'Authoritative', 'Business revenue included in the selected period.'],
      ['Fuel cost', 'Authoritative', 'Business fuel cost supplied by the application read model.'],
      ['Maintenance allocation', 'Authoritative', 'Maintenance provision/reconciliation supplied by the domain calculation.'],
      ['Fixed overhead', 'Authoritative', 'Active business fixed obligations continue across their lifecycle.'],
      ['Loan cost', 'Authoritative', 'Loan principal and interest are supplied by the loan calculation.'],
      ['Other business costs', 'Authoritative', 'Eligible business expenses are included without personal-use costs.'],
    ]
  : [
      ['Revenue', 'Authoritative', 'Actual business revenue from persisted records.'],
      ['Running cost', 'Authoritative', 'Eligible actual operating costs from persisted records.'],
      ['Business KM', 'Authoritative', 'Business-only distance from Work records.'],
      ['Balance', 'Authoritative', 'Revenue less the authoritative running-cost result.'],
    ]);

function openDetail(item) { selectedDetail.value = item; emit('open', item); }
function closeDetail() { selectedDetail.value = ''; }
watch(() => props.module, () => { selectedDetail.value = ''; void load(); });
onMounted(load);
</script>

<template>
  <section class="kfe-financial-view" :data-module="module" aria-labelledby="financial-title">
    <button class="kfe-secondary-action" type="button" @click="selectedDetail ? closeDetail() : emit('back')">‹ {{ selectedDetail ? definition.title : 'Admin' }}</button>
    <KfeStatePanel v-if="error" state="error" title="Financial view unavailable" :message="error" />
    <template v-else-if="!selectedDetail">
      <p class="kfe-eyebrow">{{ definition.eyebrow }}</p>
      <h1 id="financial-title">{{ definition.title }}</h1>
      <p class="kfe-destination-subtitle">{{ definition.subtitle }}</p>
      <p v-if="loading" class="kfe-boundary-note" role="status">Loading authoritative result…</p>
      <div v-if="isProfitability" class="kfe-segmented" aria-label="Profitability view"><button v-for="view in profitabilityViews" :key="view" type="button" :class="{ 'is-active': selectedView === view }" @click="selectedView = view">{{ view }}</button></div>
      <article class="kfe-financial-headline"><span class="kfe-card-label">{{ isProfitability ? selectedView : 'ACTUALS' }}</span><strong>{{ isProfitability ? (model?.profitability?.status === 'UNAVAILABLE' ? 'Calculation unavailable' : `Operating result ${money(model?.month?.profitPaise)}`) : (model?.brief || 'Actual business position') }}</strong><p>{{ model?.asOf ? `Updated ${new Date(model.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }` : 'Authoritative application result' }}</p></article>
      <section class="kfe-financial-section"><h2>{{ isProfitability ? 'Financial Position' : 'Actual Performance' }}</h2><div class="kfe-financial-metrics"><button v-for="item in metrics" :key="item[0]" class="kfe-financial-metric" type="button" @click="openDetail(item[0])"><span>{{ item[0] }}</span><strong>{{ item[1] }}</strong></button></div></section>
      <section v-if="isProfitability" class="kfe-financial-section"><h2>Interpretation</h2><div class="kfe-financial-breakdown"><div><span>Profitability</span><strong>{{ model?.profitability?.status === 'UNAVAILABLE' ? 'Unavailable' : 'Authoritative' }}</strong><p>Results are not fabricated when required inputs are missing.</p></div><div><span>Break-even</span><strong>{{ model?.breakEven?.status === 'UNAVAILABLE' ? 'Unavailable' : money(model?.breakEven?.breakEvenPaise) }}</strong><p>Break-even remains separate from revenue and profit.</p></div><div><span>Business KM</span><strong>{{ km(model?.month?.businessKm) }}</strong><p>Personal-use distance is excluded from business profitability.</p></div></div></section>
      <section class="kfe-financial-section"><h2>How this result is built</h2><p class="kfe-financial-note">The UI displays authoritative application/domain results; it does not recalculate financial figures.</p><div class="kfe-financial-breakdown"><div v-for="item in transparencyItems" :key="item[0]"><span>{{ item[0] }}</span><strong>{{ item[1] }}</strong><p>{{ item[2] }}</p></div></div></section>
    </template>
    <article v-else class="kfe-financial-detail"><p class="kfe-eyebrow">FULL-SCREEN BREAKDOWN</p><h2>{{ selectedDetail }}</h2><p>Authoritative values are supplied by the application query/read model. The presentation layer does not calculate financial results.</p><div class="kfe-financial-breakdown"><div v-for="item in transparencyItems" :key="item[0]"><span>{{ item[0] }}</span><strong>{{ item[1] }}</strong><p>{{ item[2] }}</p></div></div></article>
  </section>
</template>

<style scoped>
.kfe-financial-view{padding:4px 0 32px;display:grid;gap:16px}.kfe-financial-headline{padding:20px;border:1px solid var(--kfe-shell-border);border-radius:18px;background:var(--kfe-shell-surface);display:grid;gap:8px}.kfe-financial-headline strong{font-size:1.2rem;line-height:1.35}.kfe-financial-headline p,.kfe-financial-note,.kfe-financial-breakdown p{margin:0;color:var(--kfe-shell-muted);line-height:1.45}.kfe-financial-section{display:grid;gap:10px}.kfe-financial-section h2{margin:0}.kfe-financial-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kfe-financial-metric{min-height:92px;padding:14px;border:1px solid var(--kfe-shell-border);border-radius:15px;background:var(--kfe-shell-surface);color:var(--kfe-shell-text);text-align:left;display:grid;gap:7px}.kfe-financial-metric span{font-size:.72rem;color:var(--kfe-shell-muted)}.kfe-financial-metric strong{font-size:1.05rem}.kfe-financial-breakdown{display:grid;gap:8px}.kfe-financial-breakdown>div{padding:13px 14px;border:1px solid var(--kfe-shell-border);border-radius:14px;background:var(--kfe-shell-surface);display:grid;gap:4px}.kfe-financial-breakdown span{font-size:.76rem;color:var(--kfe-shell-muted)}.kfe-financial-breakdown strong{font-size:.88rem}.kfe-financial-breakdown p{font-size:.76rem}.kfe-financial-detail{display:grid;gap:12px}@media(max-width:560px){.kfe-financial-metrics{grid-template-columns:1fr}}
</style>
