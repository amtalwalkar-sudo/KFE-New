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

<style scoped>
.performance-page{width:min(100%,960px);margin:0 auto;padding:24px 16px 36px;color:var(--kfe-ui-text,#101828)}
small{font-size:.62rem;letter-spacing:.13em;font-weight:900;color:var(--kfe-muted-text,#667085)}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.head h1{margin:4px 0 3px;font-size:clamp(1.5rem,6vw,2rem);line-height:1.1;letter-spacing:-.035em}.head p{margin:0;color:var(--kfe-muted-text,#667085);font-size:.76rem;line-height:1.45}.period,.back,.next,.close{min-height:44px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:13px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-ui-text,#101828);font-weight:850;cursor:pointer}.period{padding:0 13px;font-size:.67rem;white-space:nowrap}.period b{font-size:1rem}.financial-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.financial-card{min-height:126px;padding:16px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:18px;background:var(--kfe-ui-surface,#fff);box-shadow:0 5px 18px rgba(16,24,40,.035);display:flex;flex-direction:column;justify-content:space-between}.financial-card strong{font-size:clamp(1.35rem,5vw,2rem);line-height:1;letter-spacing:-.04em}.financial-card span{font-size:.62rem;color:var(--kfe-muted-text,#667085);line-height:1.35}.financial-cash{background:var(--kfe-accent-soft,#eff6ff)}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.section-head h2{margin:4px 0 0;font-size:1rem;letter-spacing:-.02em}.section-head button,.detail-link{border:0;background:none;color:var(--kfe-ui-accent,#2563eb);font-size:.64rem;font-weight:900;cursor:pointer;padding:3px 0}.target-panel,.panel{margin-top:10px;padding:16px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:18px;background:var(--kfe-ui-surface,#fff);box-shadow:0 4px 16px rgba(16,24,40,.03)}.target-panel{background:linear-gradient(145deg,var(--kfe-ui-surface,#fff),var(--kfe-accent-soft,#eff6ff))}.target-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.target-grid>div,.metric-grid>div{padding:11px 10px;border-radius:12px;background:var(--kfe-ui-bg,#f5f7fb)}.target-grid span,.metric-grid span{display:block;font-size:.61rem;color:var(--kfe-muted-text,#667085);margin-bottom:5px}.target-grid strong,.metric-grid strong{font-size:.92rem;font-weight:900}.positive{color:var(--kfe-success,#079455)}.negative{color:var(--kfe-danger,#d92d20)}.metric-grid{display:grid;gap:8px}.metric-grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}.metric-grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}.requirement-panel{border-left:3px solid var(--kfe-ui-accent,#2563eb)}.secondary-grid{margin-top:10px}.fold{border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:16px;background:var(--kfe-ui-surface,#fff);overflow:hidden}.fold-head{width:100%;min-height:60px;display:flex;align-items:center;justify-content:space-between;text-align:left;padding:12px 14px;border:0;background:none;color:var(--kfe-ui-text,#101828);cursor:pointer}.fold-head span{display:grid;gap:3px}.fold-head b{font-size:.68rem}.fold-head>strong{font-size:1.2rem}.fold-body{padding:0 14px 14px}.fold-body>div{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid var(--kfe-ui-border,#e4e7ec);font-size:.68rem}.fold-body span{color:var(--kfe-muted-text,#667085)}.info-strip{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;padding:11px 13px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:13px;background:var(--kfe-ui-surface,#fff);font-size:.63rem;color:var(--kfe-muted-text,#667085)}.info-strip strong{color:var(--kfe-ui-text,#101828)}.state-card{min-height:180px;display:flex;align-items:center;justify-content:center;gap:10px;flex-direction:column;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:18px;background:var(--kfe-ui-surface,#fff);color:var(--kfe-muted-text,#667085);font-size:.8rem}.spinner{width:24px;height:24px;border:3px solid var(--kfe-ui-border,#e4e7ec);border-top-color:var(--kfe-ui-accent,#2563eb);border-radius:50%;animation:spin .8s linear infinite}.error-state strong{color:var(--kfe-danger,#d92e20)}@keyframes spin{to{transform:rotate(360deg)}}.detail-head{align-items:center}.back{width:44px;font-size:1.7rem}.next{padding:0 12px;font-size:.67rem}.next b{font-size:1rem}.detail{border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:20px;background:var(--kfe-ui-surface,#fff);padding:14px;box-shadow:0 7px 24px rgba(16,24,40,.04)}.tabs{display:flex;gap:6px;overflow:auto;padding-bottom:10px;border-bottom:1px solid var(--kfe-ui-border,#e4e7ec)}.tabs button{min-height:38px;display:inline-flex;align-items:center;gap:6px;padding:0 9px;border:1px solid transparent;border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.62rem;font-weight:800;white-space:nowrap}.tabs button span{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--kfe-ui-surface,#fff);font-size:.55rem}.tabs button.active{background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb);border-color:color-mix(in srgb,var(--kfe-ui-accent,#2563eb) 16%,transparent)}.detail-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:18px 2px 10px}.detail-title h2{margin:3px 0 0;font-size:1.15rem}.period-chip{padding:5px 9px;border-radius:999px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.6rem;font-weight:850}.detail-grid{display:grid;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:14px;overflow:hidden}.detail-grid>div{display:flex;justify-content:space-between;gap:16px;padding:12px 13px;border-bottom:1px solid var(--kfe-ui-border,#e4e7ec);font-size:.72rem}.detail-grid>div:last-child{border-bottom:0}.detail-grid span{color:var(--kfe-muted-text,#667085)}.detail-grid b{text-align:right;font-weight:900}.no-data{justify-content:center!important;color:var(--kfe-muted-text,#667085)!important}.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.status-grid span{padding:9px 10px;border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-muted-text,#667085);font-size:.61rem;font-weight:750}.status-grid span.ok{color:var(--kfe-success,#079455)}.note{display:grid;gap:4px;margin-top:10px;padding:12px;border-radius:13px;background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-muted-text,#667085);font-size:.68rem;line-height:1.5}.note strong{color:var(--kfe-ui-text,#101828);font-size:.64rem}.overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,24,40,.35);padding:12px}.navigator{width:min(100%,520px);max-height:88vh;overflow:auto;padding:16px;border-radius:20px;background:var(--kfe-ui-surface,#fff);box-shadow:0 20px 60px rgba(16,24,40,.25)}.navigator header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}.navigator h2{margin:4px 0;font-size:1.1rem}.close{width:40px}.periods{display:grid;gap:6px}.periods button{min-height:44px;display:flex;justify-content:space-between;align-items:center;padding:0 12px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:11px;background:var(--kfe-ui-bg,#f5f7fb);font-size:.68rem;font-weight:800;color:var(--kfe-ui-text,#101828)}.periods button.selected{border-color:var(--kfe-ui-accent,#2563eb);background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb)}.custom{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.custom label{display:grid;gap:5px;font-size:.63rem;font-weight:800}.custom input,.custom button{min-height:42px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:10px;padding:0 9px;background:var(--kfe-ui-surface,#fff)}.custom button{grid-column:1/-1;background:var(--kfe-ui-accent,#2563eb);color:white;font-weight:850}
@media(max-width:720px){.financial-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-grid.five{grid-template-columns:repeat(3,minmax(0,1fr))}.target-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:460px){.performance-page{padding:18px 12px 28px}.financial-card{min-height:112px;padding:13px}.financial-card strong{font-size:1.35rem}.metric-grid.four,.metric-grid.five{grid-template-columns:repeat(2,minmax(0,1fr))}.head p{max-width:210px}.section-head h2{font-size:.92rem}}
</style>
