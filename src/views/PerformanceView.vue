<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange, reportingRangeFor, KFE_TIME_ZONE_LABEL } from '../domain/time/ist.js'

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
  unsubscribeChanges = PerformanceService.subscribeDataChanges(() => { void refreshSnapshot() })
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
