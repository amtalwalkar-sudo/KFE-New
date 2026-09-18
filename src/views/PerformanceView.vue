<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange, reportingRangeFor, KFE_TIME_ZONE_LABEL } from '../domain/time/ist.js'

const PERIODS = ['DAY', 'WEEK', 'MONTH', '3 MONTHS', '6 MONTHS', '1 YEAR', 'MULTI-YEAR', 'TILL DATE', 'CUSTOM RANGE']
const LAYERS = {
  target: ['Position', 'Pace', 'Target drivers', 'Comparison', 'Detailed period'],
  revenue: ['Revenue position', 'Revenue composition', 'Revenue efficiency', 'Detailed revenue'],
  cost: ['Break-even position', 'Cost drivers', 'Cost movement', 'Break-even analysis', 'Detailed costs'],
  profit: ['Operating profit', 'Available cash', 'Financing detail', 'Provision planning', 'Detailed financial records'],
}
const period = ref('MONTH')
const navigatorOpen = ref(false)
const activeCard = ref(null)
const activeLayer = ref(0)
const expanded = ref(null)
const customFrom = ref('')
const customTo = ref('')
const loading = ref(true)
const error = ref('')
const snapshot = ref({ shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [], driverCollectedData: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [] })
let unsubscribeChanges = () => {}

const money = value => Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '—'
const number = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const hours = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} h` : '—'
const rate = value => Number.isFinite(Number(value)) ? `₹${Number(value).toFixed(1)}` : '—'
const metric = (value, fallback = NaN) => Number.isFinite(Number(value)) ? Number(value) : fallback

const range = computed(() => {
  if (period.value === 'CUSTOM RANGE' && customFrom.value && customTo.value) {
    const from = istDayRange(`${customFrom.value}T00:00:00+05:30`)
    const to = istDayRange(`${customTo.value}T00:00:00+05:30`)
    return { from: from.from, to: to.to }
  }
  return reportingRangeFor(period.value) || reportingRangeFor('DAY')
})
const metrics = computed(() => PerformanceService.getMetrics(snapshot.value, range.value))
const counts = computed(() => metrics.value?.counts || {})
const cards = {
  target: { title: 'Target', description: 'Target, pace and recovery position', tone: 'target' },
  revenue: { title: 'Revenue', description: 'What the business earned and how efficiently', tone: 'revenue' },
  cost: { title: 'Costs', description: 'What operating the vehicle consumed', tone: 'cost' },
  profit: { title: 'Financial detail', description: 'Profit, cash, financing and provisions', tone: 'profit' },
}
const summary = computed(() => [
  { key: 'revenue', label: 'Revenue', value: money(metrics.value?.revenue), sub: 'Authoritative shift-end revenue' },
  { key: 'cost', label: 'Operating Cost', value: money(metrics.value?.operatingCost), sub: 'Actual operating outflow' },
  { key: 'profit', label: 'Operating Profit', value: money(metrics.value?.operatingProfit), sub: 'Revenue less operating cost' },
  { key: 'cash', label: 'Available Cash', value: money(metrics.value?.availableCash), sub: 'After actual financing outflows' },
])
const target = computed(() => ({
  target: metrics.value?.target,
  actual: metrics.value?.pace?.currentRevenuePerFinancialDay,
  required: metrics.value?.pace?.requiredRevenuePerFinancialDay,
  variance: metrics.value?.pace?.paceVariance,
}))
const efficiency = computed(() => [
  ['Revenue / KM', rate(metrics.value?.revenuePerKm)],
  ['Profit / KM', rate(metrics.value?.profitPerKm)],
  ['Revenue / Hour', rate(metrics.value?.revenuePerHour)],
  ['Profit / Hour', rate(metrics.value?.profitPerHour)],
])
const scale = computed(() => [
  ['Vehicle KM', number(metrics.value?.vehicleKm ?? counts.value.vehicleKm)],
  ['Ride KM', number(metrics.value?.businessKm ?? counts.value.businessKm)],
  ['Dead KM', number(metrics.value?.deadKm ?? counts.value.deadKm)],
  ['Working Hours', hours(metrics.value?.workingHours ?? counts.value.workingHours)],
  ['Rides', number(counts.value.completedTrips ?? counts.value.rides)],
])
const costDrivers = computed(() => [
  ['Fuel', money(metrics.value?.fuelCost ?? counts.value.fuelCost)],
  ['Maintenance', money(metrics.value?.actualMaintenance ?? metrics.value?.maintenanceCost ?? counts.value.maintenanceCost)],
  ['Toll', money(metrics.value?.toll ?? counts.value.toll)],
  ['Parking', money(metrics.value?.parking ?? counts.value.parking)],
])
const requirements = computed(() => [
  ['Monthly break-even', money(metrics.value?.monthlyBreakEvenRevenue)],
  ['Daily break-even', money(metrics.value?.dailyBreakEvenRevenue)],
  ['Driver target / day', money(metrics.value?.driverTarget)],
  ['Required pace / day', money(metrics.value?.pace?.requiredRevenuePerFinancialDay)],
])
const finance = computed(() => [
  ['Financing outflow', money(metrics.value?.financingOutflow ?? metrics.value?.actualFinancingOutflow)],
  ['Prepayments', money(metrics.value?.prepayments)],
  ['Maintenance provision', money(metrics.value?.maintenanceProvision)],
  ['Renewals provision', money(metrics.value?.renewalProvision ?? metrics.value?.renewalsProvision)],
])
const activeRows = computed(() => activeCard.value ? PerformanceService.getLayerRows(activeCard.value, activeLayer.value, metrics.value) : [])
const layerTitle = computed(() => activeCard.value ? `${cards[activeCard.value].title} — ${LAYERS[activeCard.value][activeLayer.value]}` : '')
const completeness = computed(() => metrics.value?.completeness || {})

function choosePeriod(value) { period.value = value; if (value !== 'CUSTOM RANGE') navigatorOpen.value = false }
function applyCustom() { if (customFrom.value && customTo.value) { period.value = 'CUSTOM RANGE'; navigatorOpen.value = false } }
function openCard(key) { activeCard.value = key; activeLayer.value = 0 }
function back() { if (activeLayer.value) activeLayer.value -= 1; else activeCard.value = null }
function next() { if (activeCard.value && activeLayer.value < LAYERS[activeCard.value].length - 1) activeLayer.value += 1 }
function toggle(key) { expanded.value = expanded.value === key ? null : key }
async function refreshSnapshot() {
  try { snapshot.value = await PerformanceService.getSnapshot(); error.value = '' }
  catch (e) { error.value = e?.message || 'Performance data could not be loaded.' }
}
onMounted(async () => { try { await refreshSnapshot() } finally { loading.value = false }; unsubscribeChanges = PerformanceService.subscribeDataChanges(() => { void refreshSnapshot() }) })
onBeforeUnmount(() => unsubscribeChanges())
</script>

<template>
  <section class="performance-page">
    <div v-if="loading" class="state-card"><span class="spinner" aria-hidden="true"></span><span>Loading performance…</span></div>
    <div v-else-if="error" class="state-card error-state"><strong>Performance unavailable</strong><span>{{ error }}</span></div>
    <template v-else-if="!activeCard">
      <header class="head">
        <div><small>PERFORMANCE</small><h1>Business position</h1></div>
        <button class="period" @click="navigatorOpen = true">{{ period }} <b>⌄</b></button>
      </header>

      <section class="financial-grid" aria-label="Business position">
        <article v-for="item in summary" :key="item.key" class="financial-card" :class="`financial-${item.key}`">
          <small>{{ item.label }}</small><strong>{{ item.value }}</strong><span>{{ item.sub }}</span>
        </article>
      </section>

      <section class="target-panel">
        <div class="section-head"><div><small>TARGET / PACE</small><h2>Are we on pace?</h2></div><button @click="openCard('target')">Details →</button></div>
        <div class="target-grid">
          <div><span>Target / day</span><strong>{{ money(target.target) }}</strong></div>
          <div><span>Actual pace</span><strong>{{ money(target.actual) }}</strong></div>
          <div><span>Required pace</span><strong>{{ money(target.required) }}</strong></div>
          <div><span>Variance</span><strong :class="{positive: target.variance >= 0, negative: target.variance < 0}">{{ money(target.variance) }}</strong></div>
        </div>
      </section>

      <section class="panel">
        <div class="section-head"><div><small>OPERATING EFFICIENCY</small><h2>How efficiently are we working?</h2></div></div>
        <div class="metric-grid four"><div v-for="row in efficiency" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
      </section>

      <section class="panel">
        <div class="section-head"><div><small>OPERATING SCALE</small><h2>What work was done?</h2></div></div>
        <div class="metric-grid five"><div v-for="row in scale" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
      </section>

      <section class="panel">
        <div class="section-head"><div><small>COST DRIVERS</small><h2>Where did the operating cost go?</h2></div><button @click="openCard('cost')">Details →</button></div>
        <div class="metric-grid four"><div v-for="row in costDrivers" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
      </section>

      <section class="panel requirement-panel">
        <div class="section-head"><div><small>BREAK-EVEN / REQUIREMENT</small><h2>What does the business need?</h2></div><button @click="openCard('target')">Details →</button></div>
        <div class="metric-grid four"><div v-for="row in requirements" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
      </section>

      <div class="secondary-grid">
        <section class="fold" :class="{ open: expanded === 'finance' }"><button class="fold-head" @click="toggle('finance')"><span><small>FINANCING & PROVISIONS</small><b>Loan, prepayment and planning obligations</b></span><strong>{{ expanded === 'finance' ? '−' : '+' }}</strong></button><div v-if="expanded === 'finance'" class="fold-body"><div v-for="row in finance" :key="row[0]"><span>{{ row[0] }}</span><b>{{ row[1] }}</b></div><button class="detail-link" @click="openCard('profit')">Open financial detail →</button></div></section>
      </div>

      <section class="info-strip"><span>Reporting period</span><strong>{{ period }}</strong><span>·</span><span>Calendar</span><strong>{{ KFE_TIME_ZONE_LABEL }}</strong></section>
    </template>

    <template v-else>
      <header class="head detail-head"><button class="back" aria-label="Back" @click="back">‹</button><div><small>PERFORMANCE</small><h1>{{ layerTitle }}</h1><p>{{ period }} · {{ KFE_TIME_ZONE_LABEL }}</p></div><button v-if="activeLayer < LAYERS[activeCard].length - 1" class="next" @click="next">Next <b>›</b></button></header>
      <section class="detail">
        <div class="tabs"><button v-for="(layer, index) in LAYERS[activeCard]" :key="layer" :class="{ active: index === activeLayer }" @click="activeLayer = index"><span>{{ index + 1 }}</span>{{ layer }}</button></div>
        <div class="detail-title"><div><small>{{ cards[activeCard].title }}</small><h2>{{ LAYERS[activeCard][activeLayer] }}</h2></div><span class="period-chip">{{ period }}</span></div>
        <div class="detail-grid"><div v-for="(row,index) in activeRows" :key="index"><span>{{ row[0] }}</span><b>{{ row.slice(1).join(' · ') }}</b></div><div v-if="!activeRows.length" class="no-data">No records are available for this view yet.</div></div>
        <div class="status-grid"><span :class="{ok: completeness.target}">Target {{ completeness.target ? 'configured' : 'not configured' }}</span><span :class="{ok: completeness.loan}">Loan {{ completeness.loan ? 'configured' : 'not configured' }}</span><span :class="{ok: completeness.hourlyData}">Hourly {{ completeness.hourlyData ? 'available' : 'unavailable' }}</span><span :class="{ok: completeness.breakEven}">Break-even {{ completeness.breakEven ? 'calculated' : 'unavailable' }}</span></div>
        <div class="note"><strong>Calculation note</strong><span>Actual performance uses authoritative actual records. Shift-end revenue is authoritative; trip revenue remains supporting detail. Available Cash uses actual operating costs and actual financing outflows.</span></div>
      </section>
    </template>

    <div v-if="navigatorOpen" class="overlay" @click.self="navigatorOpen=false"><section class="navigator"><header><div><small>PERIOD</small><h2>Choose reporting range</h2></div><button class="close" aria-label="Close" @click="navigatorOpen=false">×</button></header><div class="periods"><button v-for="item in PERIODS" :key="item" :class="{selected: period === item}" @click="choosePeriod(item)"><span>{{ item }}</span><b>›</b></button></div><div v-if="period === 'CUSTOM RANGE'" class="custom"><label>From<input v-model="customFrom" type="date"></label><label>To<input v-model="customTo" type="date"></label><button @click="applyCustom">Apply range</button></div></section></div>
  </section>
</template>

