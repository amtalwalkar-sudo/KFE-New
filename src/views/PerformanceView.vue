<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange, reportingRangeFor, KFE_TIME_ZONE_LABEL } from '../domain/time/ist.js'
import { subscribeCanonicalDataChanges } from '../utils/indexedDB.js'

const PERIODS = ['DAY','WEEK','MONTH','3 MONTHS','6 MONTHS','1 YEAR','MULTI-YEAR','TILL DATE','CUSTOM RANGE']
const LAYERS = { target:['Position','Pace','Target drivers','Comparison','Detailed period'], revenue:['Revenue position','Revenue composition','Revenue efficiency','Time & trend','Detailed revenue'], cost:['Break-even position','Cost drivers','Cost movement','Break-even analysis','Detailed costs'], profit:['Operating profit','Available cash','Financing detail','Provision planning','Profit trend','Detailed financial records'] }
const period = ref('MONTH')
const navigatorOpen = ref(false)
const activeCard = ref(null)
const activeLayer = ref(0)
const customFrom = ref('')
const customTo = ref('')
const loading = ref(true)
const error = ref('')
const snapshot = ref({ shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [], driverCollectedData: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [] })
let unsubscribeChanges = () => {}

const money = value => Number.isFinite(value) ? `₹${Math.round(value).toLocaleString('en-IN')}` : '—'
const num = value => Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

const range = computed(() => {
  if (period.value === 'CUSTOM RANGE' && customFrom.value && customTo.value) {
    const from = istDayRange(`${customFrom.value}T00:00:00+05:30`)
    const to = istDayRange(`${customTo.value}T00:00:00+05:30`)
    return { from: from.from, to: to.to }
  }
  return reportingRangeFor(period.value) || reportingRangeFor('DAY')
})

const metrics = computed(() => PerformanceService.getMetrics(snapshot.value, range.value))
const cards = computed(() => ({
  target: { title: '🎯 Target', description: 'Target position and daily pace' },
  revenue: { title: '💰 Revenue', description: 'Actual revenue and ride efficiency' },
  cost: { title: '🧾 Costs', description: 'Actual operating costs and break-even' },
  profit: { title: '🏦 Financial detail', description: 'Operating profit, cash, financing and provisions' }
}))
const activeRows = computed(() => activeCard.value ? PerformanceService.getLayerRows(activeCard.value, activeLayer.value, metrics.value) : [])
const layerTitle = computed(() => activeCard.value ? `${cards.value[activeCard.value].title.replace(/^\S+\s/, '')} — ${LAYERS[activeCard.value][activeLayer.value]}` : '')
const completeness = computed(() => metrics.value.completeness)
function choosePeriod(value) { period.value = value; if (value !== 'CUSTOM RANGE') navigatorOpen.value = false }
function applyCustom() { if (customFrom.value && customTo.value) { period.value = 'CUSTOM RANGE'; navigatorOpen.value = false } }
function openCard(key) { activeCard.value = key; activeLayer.value = 0 }
function back() { if (activeLayer.value) activeLayer.value -= 1; else activeCard.value = null }
function next() { if (activeCard.value && activeLayer.value < LAYERS[activeCard.value].length - 1) activeLayer.value += 1 }
async function refreshSnapshot() {
  try { snapshot.value = await PerformanceService.getSnapshot(); error.value = '' }
  catch (e) { error.value = e?.message || 'Performance data could not be loaded.' }
}
onMounted(async () => {
  try { await refreshSnapshot() }
  finally { loading.value = false }
  unsubscribeChanges = subscribeCanonicalDataChanges(() => { void refreshSnapshot() })
})
onBeforeUnmount(() => unsubscribeChanges())
</script>

<template>
  <section class="performance-page">
    <div v-if="loading" class="state">Loading Performance…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else-if="!activeCard">
      <header class="head"><div><small>PERFORMANCE</small><h1>Business position</h1></div><button class="period" @click="navigatorOpen = true">{{ period }}⌄</button></header>
      <section class="hero"><small>AVAILABLE CASH</small><strong>{{ money(metrics.availableCash) }}</strong><p>Actual cash remaining after actual operating costs and actual financing outflows for this period.</p></section>
      <div class="grid">
        <button v-for="key in ['target','revenue','cost','profit']" :key="key" class="box" @click="openCard(key)">
          <h2>{{ cards[key].title }}</h2>
          <p>{{ cards[key].description }}</p>
          <em>View detail →</em>
        </button>
      </div>
    </template>
    <template v-else>
      <header class="head"><button class="back" @click="back">‹</button><div><small>PERFORMANCE</small><h1>{{ layerTitle }}</h1></div><button v-if="activeLayer < LAYERS[activeCard].length - 1" class="next" @click="next">Next ›</button></header>
      <section class="detail"><div class="tabs"><button v-for="(layer, index) in LAYERS[activeCard]" :key="layer" :class="{ active: index === activeLayer }" @click="activeLayer = index">{{ index + 1 }}. {{ layer }}</button></div><h2>{{ LAYERS[activeCard][activeLayer] }}</h2><p>Period: <b>{{ period }}</b> · Calendar: <b>{{ KFE_TIME_ZONE_LABEL }}</b></p><div class="detail-grid"><div v-for="(row, index) in activeRows" :key="index"><span>{{ row[0] }}</span><b>{{ row.slice(1).join(' · ') }}</b></div></div><div class="status-grid"><span>Target {{ completeness.target ? 'configured' : 'not configured' }}</span><span>Loan {{ completeness.loan ? 'configured' : 'not configured' }}</span><span>Hourly {{ completeness.hourlyData ? 'available' : 'unavailable' }}</span><span>Break-even {{ completeness.breakEven ? 'calculated' : 'unavailable' }}</span></div><div class="note">Actual performance uses authoritative actual records. Available Cash is driven by actual operating costs and actual loan/prepayment outflows. Provisions remain planning information and are not deducted from Available Cash. Driver Target and pace are daily-per-financial-day representations derived from the monthly authority; projection is not a target calculation.</div></section>
    </template>
    <div v-if="navigatorOpen" class="overlay"><section class="navigator"><header><div><small>PERIOD</small><h2>Choose reporting range</h2></div><button @click="navigatorOpen = false">✕</button></header><div class="periods"><button v-for="item in PERIODS" :key="item" :class="{ selected: period === item }" @click="choosePeriod(item)">{{ item }}<span>›</span></button></div><div v-if="period === 'CUSTOM RANGE'" class="custom"><label>From<input v-model="customFrom" type="date"></label><label>To<input v-model="customTo" type="date"></label><button @click="applyCustom">Apply range</button></div></section></div>
  </section>
</template>

<style scoped>
.performance-page{min-height:100%;padding:16px;box-sizing:border-box;color:#0f172a;max-width:760px;margin:auto}.head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.head small,.hero small{font-size:.68rem;font-weight:800;color:#64748b;letter-spacing:.08em}.head h1{font-size:1.22rem;margin:3px 0 0}.period,.back,.next,.navigator header button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:9px 11px;font-weight:800}.hero,.box,.detail{background:#fff;border:1px solid #e2e8f0;border-radius:16px}.hero{padding:20px;margin-bottom:12px;text-align:center;box-shadow:0 3px 12px rgba(15,23,42,.04)}.hero strong{display:block;font-size:2.25rem;line-height:1.1;margin:8px 0}.hero p{margin:0;color:#64748b;font-size:.76rem;line-height:1.45}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{min-height:135px;padding:15px;text-align:left;box-shadow:0 3px 12px rgba(15,23,42,.04)}.box h2{font-size:.96rem;margin:0 0 9px}.box p{color:#64748b;font-size:.76rem;line-height:1.4;margin:0}.box em{display:block;margin-top:16px;color:#2563eb;font-style:normal;font-size:.74rem;font-weight:800}.state{padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;text-align:center}.error{color:#b91c1c}.back{font-size:1.3rem;padding:4px 11px}.next{color:#2563eb}.detail{padding:14px}.tabs{display:flex;gap:7px;overflow-x:auto;padding-bottom:10px}.tabs button{white-space:nowrap;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:.7rem;font-weight:800}.tabs button.active{background:#0f172a;color:#fff}.detail h2{font-size:1.08rem;margin:10px 0 4px}.detail p{color:#64748b;font-size:.78rem}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.detail-grid div,.status-grid span{background:#f8fafc;border-radius:10px;padding:10px}.detail-grid span{display:block;color:#64748b;font-size:.7rem}.detail-grid b{display:block;margin-top:3px}.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.status-grid span{font-size:.7rem;font-weight:800}.note{margin-top:14px;padding:12px;border-radius:10px;background:#f8fafc;color:#475569;font-size:.75rem;line-height:1.45}.overlay{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:10000;display:flex;align-items:flex-end}.navigator{width:100%;max-height:88vh;overflow:auto;background:#fff;border-radius:20px 20px 0 0;padding:18px;box-sizing:border-box}.navigator header{display:flex;justify-content:space-between;align-items:flex-start}.navigator h2{font-size:1.1rem;margin:3px 0 14px}.periods{display:grid;gap:7px}.periods button{display:flex;justify-content:space-between;border:1px solid #e2e8f0;background:#f8fafc;border-radius:11px;padding:12px;font-weight:800}.periods button.selected{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.custom{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.custom label{font-size:.72rem;font-weight:800}.custom input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd5e1;border-radius:9px}.custom button{grid-column:1/-1;padding:11px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:800}@media(max-width:430px){.grid{gap:8px}.box{padding:12px;min-height:130px}.performance-page{padding:12px}}
</style>
