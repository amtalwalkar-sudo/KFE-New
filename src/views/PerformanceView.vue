<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { istDayRange, getKfeReferenceNow, istMonthRange, istParts, reportingRangeFor, KFE_TIME_ZONE_LABEL } from '../domain/time/ist.js'

const PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM DURATION']
const LAYERS = {
  target: ['Position', 'Pace', 'Target drivers', 'Comparison', 'Detailed period'],
  revenue: ['Revenue position', 'Revenue composition', 'Revenue efficiency', 'Detailed revenue'],
  cost: ['Break-even position', 'Cost drivers', 'Cost movement', 'Break-even analysis', 'Detailed costs'],
  profit: ['Operating profit', 'Available cash', 'Financing detail', 'Provision planning', 'Detailed financial records'],
}
const period = ref('MONTHLY')
const anchor = ref(getKfeReferenceNow())
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

const dayAtNoon = value => { const p = istParts(value); return p ? new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) : new Date(value) }
const weekStart = value => { const day = dayAtNoon(value); return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000) }
const yearRange = value => {
  const p = istParts(value)
  if (!p) return reportingRangeFor('DAY')
  const from = istDayRange(new Date(Date.UTC(p.year, 0, 1, 12))).from
  const to = istMonthRange(new Date(Date.UTC(p.year, 11, 1, 12)), new Date(Date.UTC(p.year, 11, 31, 12))).to
  return { from, to }
}
const range = computed(() => {
  if (period.value === 'CUSTOM DURATION' && customFrom.value && customTo.value) {
    const from = istDayRange(`${customFrom.value}T00:00:00+05:30`)
    const to = istDayRange(`${customTo.value}T00:00:00+05:30`)
    return { from: from.from, to: to.to }
  }
  if (period.value === 'DAILY') return istDayRange(anchor.value)
  if (period.value === 'WEEKLY') { const start = weekStart(anchor.value); const end = new Date(start.getTime() + 6 * 86400000); return { from: istDayRange(start).from, to: istDayRange(end).to } }
  if (period.value === 'MONTHLY') return istMonthRange(anchor.value, anchor.value)
  if (period.value === 'YEARLY') return yearRange(anchor.value)
  return reportingRangeFor('MONTH')
})
const periodLabel = computed(() => {
  const formatter = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options })
  if (period.value === 'DAILY') return formatter({ day:'numeric', month:'short', year:'numeric' }).format(anchor.value)
  if (period.value === 'WEEKLY') { const start = weekStart(anchor.value); const end = new Date(start.getTime() + 6 * 86400000); return `${formatter({day:'numeric',month:'short'}).format(start)} – ${formatter({day:'numeric',month:'short',year:'numeric'}).format(end)}` }
  if (period.value === 'MONTHLY') return formatter({ month:'long', year:'numeric' }).format(anchor.value)
  if (period.value === 'YEARLY') return formatter({ year:'numeric' }).format(anchor.value)
  if (period.value === 'CUSTOM DURATION') return customFrom.value && customTo.value ? `${customFrom.value} → ${customTo.value}` : 'Choose dates'
  return ''
})
const movePeriod = amount => {
  const d = dayAtNoon(anchor.value)
  if (period.value === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + amount)
  else if (period.value === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + amount)
  else if (period.value === 'WEEKLY') d.setUTCDate(d.getUTCDate() + amount * 7)
  else d.setUTCDate(d.getUTCDate() + amount)
  anchor.value = d
}

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

const calculationNotices = computed(() => {
  const m = metrics.value || {}
  const notices = []
  const trace = m.breakEvenTrace || {}
  const firstMissing = trace.firstMissing

  const breakEvenReasons = {
    input: {
      title: 'Break-even input record missing',
      why: 'There is no applicable effective-dated break-even input for this period.',
      action: 'Go to Admin → Planning & Controls → Break-even Inputs and create or activate the applicable record.',
      chain: 'Break-even input → Break-even → Driver target',
    },
    maintenanceProvisionPerKm: {
      title: 'Maintenance provision / km is missing',
      why: 'The active break-even record does not contain a finite maintenance provision per km.',
      action: 'Complete the maintenance provision per km in the applicable Break-even Inputs record.',
      chain: 'Maintenance provision / km → Variable cost → Break-even → Driver target',
    },
    fuelCostPerKm: {
      title: 'Fuel cost / km is missing',
      why: 'Fuel cost per km could not be derived from the authoritative vehicle/fuel calculation.',
      action: 'Complete the applicable vehicle fuel-cost configuration or source data, then refresh Performance.',
      chain: 'Fuel cost / km → Variable cost → Break-even → Driver target',
    },
    vehicleKm: {
      title: 'Vehicle km is missing',
      why: 'Authoritative vehicle kilometres are not available for the selected period.',
      action: 'Ensure the vehicle odometer/ride distance records cover this period, then refresh Performance.',
      chain: 'Vehicle km → Variable cost → Break-even → Driver target',
    },
    loanScheduledObligation: {
      title: 'Loan scheduled obligation is missing',
      why: 'The active loan obligation could not be derived as a finite amount for the selected period.',
      action: 'Complete the active loan inputs and schedule in Admin → Finance → Loans.',
      chain: 'Loan obligation → Fixed cost → Break-even → Driver target',
    },
    renewalProvision: {
      title: 'Renewal provision is missing',
      why: 'The renewal provision required by the break-even calculation is not available as a finite amount.',
      action: 'Complete the applicable renewal provision in Admin → Planning & Controls.',
      chain: 'Renewal provision → Fixed cost → Break-even → Driver target',
    },
  }

  if (!m.completeness?.breakEven) {
    const key = firstMissing || (m.breakEvenTrace ? 'input' : null)
    const detail = key ? breakEvenReasons[key] : null
    notices.push({
      key: `break-even-${key || 'unknown'}`,
      kind: 'break-even',
      title: detail?.title || 'Break-even calculation incomplete',
      why: detail?.why || 'One or more authoritative break-even dependencies are incomplete.',
      action: detail?.action || 'Open the applicable Admin configuration and complete the missing break-even dependency.',
      chain: detail?.chain || 'Break-even inputs → Break-even → Driver target',
    })
  }

  if (!m.driverTargetAvailable) {
    const targetReasons = {
      MISSING_AUTHORITATIVE_TARGET_INPUT: {
        title: 'Driver target input is incomplete',
        why: 'The effective driver target record is missing or does not contain a valid desired driver profit / take-home value, or the monthly break-even is unavailable.',
        action: 'Complete the effective Driver Target record and resolve any Break-even notice above.',
        chain: 'Break-even + desired driver profit → Monthly target base → Daily target',
      },
      MISSING_HISTORICAL_DRIVER_TARGET_INPUT: {
        title: 'Historical driver target input is incomplete',
        why: 'A prior month required for the rolling target balance has no valid effective driver target input.',
        action: 'Complete the missing historical Driver Target record for the affected month, then refresh Performance.',
        chain: 'Historical target → Rolling balance → Current daily target',
      },
      NO_FINANCIAL_DRIVER_TARGET_DAY: {
        title: 'No eligible driver target day',
        why: 'There is no driver shift in the selected month from which the current target day can be anchored.',
        action: 'Start or record the applicable driver shift, then refresh Performance.',
        chain: 'Driver shift → Eligible target day → Current daily target',
      },
    }
    const detail = targetReasons[m.driverTargetReason] || {
      title: 'Driver target calculation incomplete',
      why: 'The authoritative driver-target pipeline could not produce a finite current daily target.',
      action: 'Resolve the Break-even and Driver Target inputs, then refresh Performance.',
      chain: 'Break-even + driver target → Rolling target → Current daily target',
    }
    notices.push({
      key: 'driver-target',
      kind: 'target',
      ...detail,
    })
  }

  return notices
})

const calculationHealth = computed(() => {
  const m = metrics.value || {}
  return {
    breakEven: Number.isFinite(Number(m.monthlyBreakEvenRevenue)) ? money(m.monthlyBreakEvenRevenue) : 'Unavailable',
    target: Number.isFinite(Number(m.driverTarget)) ? money(m.driverTarget) : 'Unavailable',
    healthy: calculationNotices.value.length === 0,
  }
})

function choosePeriod(value) { period.value = value }
function applyCustom() { if (customFrom.value && customTo.value && customFrom.value <= customTo.value) period.value = 'CUSTOM DURATION' }
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
        <button class="today-period" @click="anchor = getKfeReferenceNow(); period = 'MONTHLY'">Current month</button>
      </header>
      <div class="performance-period-controls" aria-label="Performance date filters">
        <div class="slider performance-slider" :style="{ '--period-index': PERIODS.indexOf(period) }">
          <button v-for="item in PERIODS" :key="item" :class="{active: period === item}" @click="choosePeriod(item)">{{ item }}</button>
        </div>
        <div v-if="period !== 'CUSTOM DURATION'" class="period performance-period">
          <button @click="movePeriod(-1)" aria-label="Previous period">‹</button>
          <strong>{{ periodLabel }}</strong>
          <button @click="movePeriod(1)" aria-label="Next period">›</button>
        </div>
        <div v-else class="performance-custom-range">
          <label>From<input v-model="customFrom" type="date"></label>
          <label>To<input v-model="customTo" type="date"></label>
          <button :disabled="!customFrom || !customTo || customFrom > customTo" @click="applyCustom">Apply</button>
        </div>
      </div>

      <section class="financial-grid" aria-label="Business position">
        <article v-for="item in summary" :key="item.key" class="financial-card" :class="`financial-${item.key}`">
          <small>{{ item.label }}</small><strong>{{ item.value }}</strong><span>{{ item.sub }}</span>
        </article>
      </section>

      <section class="calculation-health" :class="{ 'has-notices': calculationNotices.length }" aria-label="Calculation health">
        <div class="calculation-health-head">
          <div>
            <small>CALCULATION HEALTH</small>
            <h2>{{ calculationHealth.healthy ? 'Calculations healthy' : `${calculationNotices.length} calculation notice${calculationNotices.length === 1 ? '' : 's'}` }}</h2>
          </div>
          <span class="health-status" :class="{ healthy: calculationHealth.healthy }">{{ calculationHealth.healthy ? 'OK' : 'Needs attention' }}</span>
        </div>
        <div class="health-summary">
          <div><span>Monthly break-even</span><strong>{{ calculationHealth.breakEven }}</strong></div>
          <div><span>Current daily target</span><strong>{{ calculationHealth.target }}</strong></div>
        </div>
        <div v-if="calculationNotices.length" class="calculation-notices" role="status">
          <article v-for="notice in calculationNotices" :key="notice.key" class="calculation-notice">
            <div class="notice-title"><span aria-hidden="true">⚠</span><strong>{{ notice.title }}</strong></div>
            <p><b>Why:</b> {{ notice.why }}</p>
            <p><b>Corrective action:</b> {{ notice.action }}</p>
            <p class="notice-chain"><b>Calculation chain:</b> {{ notice.chain }}</p>
          </article>
        </div>
      </section>

      <section class="calculation-table-panel" aria-label="Today's break-even calculation">
        <div class="section-head">
          <div><small>BREAK-EVEN CALCULATION</small><h2>Today’s read-only cost build-up</h2></div>
          <span class="calculation-live-badge">{{ metrics.dailyBreakEven?.vehicleKm != null ? 'Live KM basis' : 'Waiting for KM' }}</span>
        </div>
        <div class="calculation-table-wrap">
          <table class="calculation-table">
            <thead><tr><th>Component</th><th>Basis</th><th>Today</th></tr></thead>
            <tbody>
              <tr><td>Loan EMI</td><td>{{ metrics.dailyBreakEven?.daysInMonth ? `${money(metrics.loan?.emi)} ÷ ${metrics.dailyBreakEven.daysInMonth} days` : 'Daily amortization' }}</td><td>{{ metrics.dailyBreakEven?.loanScheduledObligation != null ? money(metrics.dailyBreakEven.loanScheduledObligation) : 'Unavailable — loan input incomplete' }}</td></tr>
              <tr><td>Compliance / renewal</td><td>Annual/validity cost amortized per day</td><td>{{ metrics.dailyBreakEven?.renewalProvision != null ? money(metrics.dailyBreakEven.renewalProvision) : 'Unavailable — compliance cost/validity missing' }}</td></tr>
              <tr><td>Maintenance provision</td><td>{{ metrics.dailyBreakEven?.maintenanceProvisionPerKm != null ? `${rate(metrics.dailyBreakEven.maintenanceProvisionPerKm)} × ${number(metrics.dailyBreakEven.vehicleKm)} km` : 'Rate unavailable' }}</td><td>{{ metrics.dailyBreakEven?.maintenanceProvision != null ? money(metrics.dailyBreakEven.maintenanceProvision) : 'Unavailable — maintenance rate missing' }}</td></tr>
              <tr><td>Fuel</td><td>{{ metrics.dailyBreakEven?.fuelCostPerKm != null ? `${rate(metrics.dailyBreakEven.fuelCostPerKm)} × ${number(metrics.dailyBreakEven.vehicleKm)} km` : 'Rate unavailable' }}</td><td>{{ metrics.dailyBreakEven?.fuelCost != null ? money(metrics.dailyBreakEven.fuelCost) : 'Unavailable — fuel rate/KM missing' }}</td></tr>
              <tr class="total-row"><td colspan="2"><strong>Total break-even for today</strong></td><td><strong>{{ metrics.dailyBreakEven?.total != null ? money(metrics.dailyBreakEven.total) : 'Unavailable — calculation incomplete' }}</strong></td></tr>
            </tbody>
          </table>
        </div>
        <div class="calculation-live-note">
          Dynamic rows use the authoritative fuel rate and vehicle kilometres available at calculation time. As GPS/odometer data and rides update, the KM-based fuel and maintenance amounts can update during an open shift. Fixed obligations do not change during the day. The final shift-end value becomes authoritative once the shift closes.
        </div>
      </section>

      <section class="calculation-table-panel target-calculation-panel" aria-label="Today's driver target calculation">
        <div class="section-head">
          <div><small>DRIVER TARGET CALCULATION</small><h2>Today’s target build-up</h2></div>
        </div>
        <div class="calculation-table-wrap">
          <table class="calculation-table">
            <thead><tr><th>Component</th><th>Basis</th><th>Today</th></tr></thead>
            <tbody>
              <tr><td>Today’s break-even</td><td>Fixed + dynamic operating cost</td><td>{{ metrics.dailyTargetTotal != null ? money(metrics.dailyTargetTotal - (metrics.driverTargetDesiredProfitDaily || 0)) : 'Unavailable — break-even incomplete' }}</td></tr>
              <tr><td>Desired driver profit / take-home</td><td>{{ metrics.dailyBreakEven?.daysInMonth ? `${money(metrics.driverTargetDesiredProfitMonthly)} ÷ ${metrics.dailyBreakEven.daysInMonth} days` : 'Daily amortization' }}</td><td>{{ metrics.driverTargetDesiredProfitDaily != null ? money(metrics.driverTargetDesiredProfitDaily) : 'Unavailable — target input missing' }}</td></tr>
              <tr><td>Rolling balance adjustment</td><td>Authoritative rolling target balance</td><td>{{ metrics.driverTargetRecoveryAdjustment != null ? money(metrics.driverTargetRecoveryAdjustment) : 'Unavailable — rolling target incomplete' }}</td></tr>
              <tr class="total-row"><td colspan="2"><strong>Current daily driver target</strong></td><td><strong>{{ metrics.driverTarget != null ? money(metrics.driverTarget) : 'Unavailable — see Calculation Notices' }}</strong></td></tr>
            </tbody>
          </table>
        </div>
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

      <section class="info-strip"><span>Reporting period</span><strong>{{ periodLabel }}</strong><span>·</span><span>Calendar</span><strong>{{ KFE_TIME_ZONE_LABEL }}</strong></section>
    </template>

    <template v-else>
      <header class="head detail-head"><button class="back" aria-label="Back" @click="back">‹</button><div><small>PERFORMANCE</small><h1>{{ layerTitle }}</h1><p>{{ periodLabel }} · {{ KFE_TIME_ZONE_LABEL }}</p></div><button v-if="activeLayer < LAYERS[activeCard].length - 1" class="next" @click="next">Next <b>›</b></button></header>
      <section class="detail">
        <div class="tabs"><button v-for="(layer, index) in LAYERS[activeCard]" :key="layer" :class="{ active: index === activeLayer }" @click="activeLayer = index"><span>{{ index + 1 }}</span>{{ layer }}</button></div>
        <div class="detail-title"><div><small>{{ cards[activeCard].title }}</small><h2>{{ LAYERS[activeCard][activeLayer] }}</h2></div><span class="period-chip">{{ periodLabel }}</span></div>
        <div class="detail-grid"><div v-for="(row,index) in activeRows" :key="index"><span>{{ row[0] }}</span><b>{{ row.slice(1).join(' · ') }}</b></div><div v-if="!activeRows.length" class="no-data">No records are available for this view yet.</div></div>
        <div class="status-grid"><span :class="{ok: completeness.target}">Target {{ completeness.target ? 'configured' : 'not configured' }}</span><span :class="{ok: completeness.loan}">Loan {{ completeness.loan ? 'configured' : 'not configured' }}</span><span :class="{ok: completeness.hourlyData}">Hourly {{ completeness.hourlyData ? 'available' : 'unavailable' }}</span><span :class="{ok: completeness.breakEven}">Break-even {{ completeness.breakEven ? 'calculated' : 'unavailable' }}</span></div>
        <div v-if="!completeness.breakEven && metrics.breakEvenTrace?.firstMissing" class="diagnostic-strip"><strong>Break-even dependency missing</strong><span>{{ metrics.breakEvenTrace.firstMissing }}</span></div>
        <div class="note"><strong>Calculation note</strong><span>Actual performance uses authoritative actual records. Shift-end revenue is authoritative; trip revenue remains supporting detail. Available Cash uses actual operating costs and actual financing outflows.</span></div>
      </section>
    </template>
  </section>
</template>


<style scoped>
.calculation-health{margin:1rem 0;padding:1rem 1.1rem;border:1px solid var(--kfe-border,#d9dee7);border-radius:18px;background:var(--kfe-surface,#fff);box-shadow:0 4px 16px rgba(0,0,0,.04)}
.calculation-health.has-notices{border-color:var(--kfe-warning-border,#e1b84b)}
.calculation-health-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.calculation-health small{letter-spacing:.08em;font-weight:700;opacity:.7}.calculation-health h2{margin:.2rem 0 0;font-size:1rem}
.health-status{font-size:.78rem;font-weight:700;padding:.35rem .6rem;border-radius:999px;background:rgba(190,130,0,.12)}.health-status.healthy{background:rgba(30,140,80,.12)}
.health-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem;margin-top:.8rem}.health-summary div{display:flex;justify-content:space-between;gap:.75rem;padding:.7rem .8rem;border-radius:12px;background:var(--kfe-muted-surface,#f6f7f9)}.health-summary span{font-size:.82rem;opacity:.72}.health-summary strong{font-size:.9rem}
.calculation-notices{display:grid;gap:.65rem;margin-top:.8rem}.calculation-notice{padding:.85rem;border-radius:14px;background:rgba(190,130,0,.07);border:1px solid rgba(190,130,0,.2)}.notice-title{display:flex;align-items:center;gap:.45rem}.calculation-notice p{margin:.5rem 0 0;font-size:.84rem;line-height:1.45}.notice-chain{opacity:.78}
@media (max-width:600px){.health-summary{grid-template-columns:1fr}.calculation-health{padding:.9rem}}

.calculation-table-panel{margin:1rem 0;padding:1rem 1.1rem;border:1px solid var(--kfe-border,#d9dee7);border-radius:18px;background:var(--kfe-surface,#fff)}
.calculation-live-badge{font-size:.75rem;font-weight:700;padding:.35rem .6rem;border-radius:999px;background:rgba(30,140,80,.1)}
.calculation-table-wrap{overflow-x:auto;margin-top:.8rem}.calculation-table{width:100%;border-collapse:collapse;min-width:560px}.calculation-table th,.calculation-table td{padding:.72rem .55rem;border-bottom:1px solid var(--kfe-border,#e6e9ee);text-align:left;vertical-align:top}.calculation-table th:last-child,.calculation-table td:last-child{text-align:right;white-space:nowrap}.calculation-table th{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;opacity:.65}.calculation-table td{font-size:.84rem}.calculation-table td:nth-child(2){opacity:.7}.calculation-table .total-row td{border-bottom:0;padding-top:.9rem}.calculation-live-note{margin-top:.75rem;font-size:.78rem;line-height:1.45;opacity:.68}.target-calculation-panel{margin-top:.8rem}
</style>
