<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { getKfeReferenceNow, istDayRange, istMonthRange, istParts } from '../domain/time/ist.js'
import { SyntheticDataService } from '../application/synthetic/syntheticDataService.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const PERIODS = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM']
const syntheticSource = SyntheticDataService.getActiveDataSource() === 'synthetic'
const period = ref(syntheticSource ? 'SYNTHETIC' : 'MONTH')
const anchor = ref(getKfeReferenceNow())
const customFrom = ref('')
const customTo = ref('')
const openSection = ref(null)
const detailGroup = ref(null)
const loading = ref(true)
const error = ref('')
const snapshot = ref({ shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [], driverCollectedData: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [], compliancePayments: [] })
let unsubscribeChanges = () => {}

const money = value => Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '—'
const money2 = value => Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const num = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null
const dayAtNoon = value => { const p = istParts(value); return p ? new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) : new Date(value) }
const weekStart = value => { const day = dayAtNoon(value); return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000) }
const yearRange = value => { const p = istParts(value); if (!p) return istDayRange(value); const from = new Date(Date.UTC(p.year, 0, 1, 12)); const to = new Date(Date.UTC(p.year, 11, 31, 12)); return { from: istDayRange(from).from, to: istDayRange(to).to } }

const syntheticHistoryRange = computed(() => {
  if (SyntheticDataService.getActiveDataSource() !== 'synthetic') return null
  const shifts = snapshot.value?.shifts || []
  const dates = shifts.map(row => row.shiftStartAt || row.shiftEndAt).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()))
  if (!dates.length) return null
  const from = new Date(Math.min(...dates.map(date => date.getTime())))
  const to = new Date(Math.max(...dates.map(date => date.getTime())))
  return { from: istDayRange(from).from, to: istDayRange(to).to }
})
const syntheticFullHistoryAvailable = computed(() => SyntheticDataService.getActiveDataSource() === 'synthetic' && Number(snapshot.value?.shifts?.length) === 1826 && Boolean(syntheticHistoryRange.value))
const periodOptions = computed(() => syntheticFullHistoryAvailable.value ? ['SYNTHETIC', ...PERIODS] : PERIODS)

const range = computed(() => {
  if (period.value === 'SYNTHETIC') return syntheticHistoryRange.value || istMonthRange(anchor.value, anchor.value)
  if (period.value === 'CUSTOM' && customFrom.value && customTo.value) return { from: istDayRange(`${customFrom.value}T00:00:00+05:30`).from, to: istDayRange(`${customTo.value}T00:00:00+05:30`).to }
  if (period.value === 'DAY') return istDayRange(anchor.value)
  if (period.value === 'WEEK') { const from = weekStart(anchor.value); const to = new Date(from.getTime() + 6 * 86400000); return { from: istDayRange(from).from, to: istDayRange(to).to } }
  if (period.value === 'YEAR') return yearRange(anchor.value)
  return istMonthRange(anchor.value, anchor.value)
})

const periodLabel = computed(() => {
  const f = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options })
  if (period.value === 'SYNTHETIC') return syntheticHistoryRange.value ? `${f({day:'numeric',month:'short',year:'numeric'}).format(syntheticHistoryRange.value.from)} – ${f({day:'numeric',month:'short',year:'numeric'}).format(syntheticHistoryRange.value.to)}` : '5-year synthetic history'
  if (period.value === 'CUSTOM') return customFrom.value && customTo.value ? `${f({day:'numeric',month:'short',year:'numeric'}).format(new Date(`${customFrom.value}T12:00:00Z`))} – ${f({day:'numeric',month:'short',year:'numeric'}).format(new Date(`${customTo.value}T12:00:00Z`))}` : 'Choose dates'
  if (period.value === 'DAY') return f({ weekday:'short', day:'numeric', month:'short', year:'numeric' }).format(anchor.value)
  if (period.value === 'WEEK') { const s=weekStart(anchor.value), e=new Date(s.getTime()+6*86400000); return `${f({day:'numeric',month:'short'}).format(s)} – ${f({day:'numeric',month:'short',year:'numeric'}).format(e)}` }
  if (period.value === 'YEAR') return f({year:'numeric'}).format(anchor.value)
  return f({month:'long',year:'numeric'}).format(anchor.value)
})

const metrics = computed(() => PerformanceService.getMetrics(snapshot.value, range.value))
const m = computed(() => metrics.value || {})
const diagnostics = computed(() => PerformanceService.getDiagnostics(m.value))
const actualProfit = computed(() => finite(m.value.actualProfit ?? m.value.operatingProfit))
const indicativeProfit = computed(() => finite(m.value.indicativeProfit))
const indicativeProvision = computed(() => finite(m.value.totalIndicativeProvision))
const fuelEconomy = computed(() => {
  const km = finite(m.value.vehicleKm)
  const kg = finite(m.value.fuelQty)
  return km != null && kg > 0 ? km / kg : null
})
const fuelCostPerKg = computed(() => {
  const cost = finite(m.value.fuelCost)
  const kg = finite(m.value.fuelQty)
  return cost != null && kg > 0 ? cost / kg : null
})
const businessKm = computed(() => finite(m.value.businessKm))
const deadKm = computed(() => finite(m.value.deadKm))
const deadKmPct = computed(() => {
  const km = finite(m.value.vehicleKm)
  return km > 0 && deadKm.value != null ? Math.max(0, Math.min(100, deadKm.value / km * 100)) : 0
})
const revenueKmPct = computed(() => Math.max(0, 100 - deadKmPct.value))
const target = computed(() => finite(m.value.driverTarget))
const targetRevenue = computed(() => finite(m.value.revenue))
const targetLeft = computed(() => target.value != null && targetRevenue.value != null ? Math.max(0, target.value - targetRevenue.value) : null)
const breakEven = computed(() => finite(m.value.monthlyBreakEvenRevenue))
const breakEvenLeft = computed(() => breakEven.value != null && targetRevenue.value != null ? Math.max(0, breakEven.value - targetRevenue.value) : null)
const forecast = computed(() => m.value.operatingKmForecast || null)
const syntheticSummary = computed(() => {
  if (!syntheticFullHistoryAvailable.value || period.value !== 'SYNTHETIC') return null
  const dailyForecast = finite(forecast.value?.calculatedForecast?.dailyKm)
  const multiplier = finite(m.value.driverTargetOperatingKmMultiplier)
  return {
    shifts: snapshot.value.shifts.length,
    dailyForecast,
    multiplier,
    observedDays: finite(forecast.value?.observedOperatingDays),
  }
})
const forecastKm = computed(() => finite(forecast.value?.effectiveForecast?.fullPeriodKm))
const actualKm = computed(() => finite(m.value.vehicleKm))
const outlookItems = computed(() => [
  { key:'target', label:'Target', value:money(target.value), sub:targetLeft.value == null ? 'Not available' : targetLeft.value > 0 ? `${money(targetLeft.value)} remaining` : 'Target reached', state: target.value == null ? 'muted' : targetLeft.value > 0 ? 'open' : 'done' },
  { key:'breakEven', label:'Break-even', value:money(breakEven.value), sub:breakEvenLeft.value == null ? 'Not available' : breakEvenLeft.value > 0 ? `${money(breakEvenLeft.value)} remaining` : 'Reached', state: breakEven.value == null ? 'muted' : breakEvenLeft.value > 0 ? 'open' : 'done' },
  { key:'forecast', label:'Operating KM outlook', value:money(forecastKm.value), sub:forecast.value?.observedOperatingDays ? `${num(forecast.value.observedOperatingDays)} observed operating days` : 'Evidence building', state:forecastKm.value == null ? 'muted' : 'ready' },
])

const sections = computed(() => [
  { key:'activity', title:'How did we operate?', kicker:'OPERATING ACTIVITY', summary:`${num(m.value.vehicleKm)} KM · ${num(m.value.workingHours)} HRS · ${num(m.value.counts?.trips)} TRIPS` },
  { key:'money', title:'Where did the money go?', kicker:'MONEY FLOW', summary:`${money(m.value.actualOperatingCost)} operating cost` },
  { key:'economics', title:'Unit economics', kicker:'BUSINESS EFFICIENCY', summary:`${money(m.value.revenuePerKm)} / KM · ${money(m.value.revenuePerHour)} / HOUR · ${fuelEconomy.value != null ? num(fuelEconomy.value) + ' KM/KG' : '—'}` },
  { key:'position', title:'Provisions', kicker:'PROVISIONS', summary:'Loan · Maintenance · Compliance' },
])

const detailGroups = computed(() => {
  const cost = finite(m.value.actualOperatingCost)
  return [
    { key:'revenue', title:'Revenue', kicker:'ACTUAL', value:money(m.value.revenue), formula:'Authoritative revenue is the sum of qualifying shift-end revenue records in the selected period.', rows:[['Shift-end revenue',money(m.value.revenue)],['Trips',num(m.value.counts?.trips)],['Revenue / trip',money(m.value.revenuePerTrip)]] },
    { key:'cost', title:'Operating cost', kicker:'ACTUAL', value:money(cost), formula:'Operating Cost = Fuel + Toll + Parking + Actual Maintenance.', rows:[['Fuel',money(m.value.fuelCost)],['Toll',money(m.value.toll)],['Parking',money(m.value.parking)],['Actual maintenance',money(m.value.actualMaintenance)],['Operating cost',money(cost)]] },
    { key:'indicativeProfit', title:'Indicative profit', kicker:'INDICATIVE', value:money(indicativeProfit.value), formula:'Indicative Profit = Authoritative Revenue − Loan Provision − Maintenance Provision − Compliance Provision for the selected period.', rows:[['Authoritative revenue',money(m.value.revenue)],['Loan provision',money(m.value.loanProvisionForPeriod)],['Maintenance provision',money(m.value.maintenanceProvision)],['Compliance provision',money(m.value.renewalProvision)],['Total provisions',money(m.value.totalIndicativeProvision)],['Indicative profit',money(indicativeProfit.value)]] },
    { key:'actualProfit', title:'Actual profit', kicker:'ACTUAL', value:money(actualProfit.value), formula:'Actual Profit = Authoritative Revenue − Actual Operating Expenses. Financing payments remain separate from operating profit.', rows:[['Authoritative revenue',money(m.value.revenue)],['Fuel',money(m.value.fuelCost)],['Toll',money(m.value.toll)],['Parking',money(m.value.parking)],['Actual maintenance',money(m.value.actualMaintenance)],['Actual operating expenses',money(m.value.actualOperatingCost)],['Actual profit',money(actualProfit.value)]] },
    { key:'revenueKm', title:'Revenue / KM', kicker:'ACTUAL', value:money2(m.value.revenuePerKm), formula:'Revenue / KM = authoritative revenue ÷ authoritative vehicle KM.', rows:[['Revenue',money(m.value.revenue)],['Vehicle KM',num(m.value.vehicleKm)],['Revenue / KM',money2(m.value.revenuePerKm)]] },
    { key:'revenueHour', title:'Revenue / hour', kicker:'ACTUAL', value:money2(m.value.revenuePerHour), formula:'Revenue / hour = authoritative revenue ÷ qualifying working hours from completed shifts.', rows:[['Revenue',money(m.value.revenue)],['Working hours',num(m.value.workingHours)],['Revenue / hour',money2(m.value.revenuePerHour)]] },
    { key:'fuelEconomy', title:'Fuel economy', kicker:'ACTUAL', value:fuelEconomy.value == null ? '—' : `${num(fuelEconomy.value)} KM/KG`, formula:'Fuel economy = authoritative vehicle KM ÷ recorded CNG quantity in KG.', rows:[['Vehicle KM',num(m.value.vehicleKm)],['CNG consumed',m.value.fuelQty == null ? '—' : `${num(m.value.fuelQty)} KG`],['Fuel economy',fuelEconomy.value == null ? '—' : `${num(fuelEconomy.value)} KM/KG`],['Fuel cost / KG',money2(fuelCostPerKg.value)]] },
    { key:'activity', title:'Operating activity', kicker:'ACTUAL', value:num(m.value.vehicleKm) + ' KM', formula:'Operating KM comes from qualifying shift closing odometer minus start odometer. Business KM comes from validated completed-trip KM.', rows:[['Vehicle KM',num(m.value.vehicleKm)],['Revenue-generating KM',num(businessKm.value)],['Dead KM',num(deadKm.value)],['Working hours',num(m.value.workingHours)],['Completed trips',num(m.value.counts?.trips)]] },
    { key:'provision', title:'Provisions', kicker:'INDICATIVE', value:money(m.value.totalIndicativeProvision), formula:'Period provisions are the obligations allocated to the selected period: loan + maintenance + compliance. They are used by Indicative Profit and remain separate from actual operating expenses and settlement balances.', rows:[['Loan provision · selected period',money(m.value.loanProvisionForPeriod)],['Maintenance provision · selected period',money(m.value.maintenanceProvision)],['Compliance provision · selected period',money(m.value.renewalProvision)],['Total provisions · selected period',money(m.value.totalIndicativeProvision)],['Loan rolling balance',money(m.value.finance?.provisionBalance)],['Maintenance rolling balance',money(m.value.maintenanceProvisionBalance)],['Compliance rolling balance',money(m.value.complianceProvisionBalance)]] },
    { key:'target', title:'Target', kicker:'INDICATIVE', value:money(target.value), formula:'Current target is supplied by the rolling driver-target authority. It remains separate from authoritative actual revenue.', rows:[['Current target',money(target.value)],['Revenue achieved',money(targetRevenue.value)],['Target remaining',money(targetLeft.value)],['Remaining eligible days',num(m.value.driverTargetRemainingEligibleDays)],['Desired driver profit / take-home',money(m.value.driverTargetDesiredProfitMonthly)]] },
    { key:'breakEven', title:'Break-even', kicker:'INDICATIVE', value:money(breakEven.value), formula:'Break-even is supplied by the authoritative break-even engine and presented here as an outlook requirement, separate from actual operating result.', rows:[['Break-even revenue',money(breakEven.value)],['Revenue achieved',money(targetRevenue.value)],['Revenue remaining',money(breakEvenLeft.value)],['Fuel cost / KM',money2(m.value.breakEvenInputs?.fuelCostPerKm)],['Maintenance provision / KM',money2(m.value.breakEvenInputs?.maintenanceProvisionPerKm)]] },
    { key:'loan', title:'Loan position', kicker:'FINANCIAL POSITION', value:money(m.value.finance?.provisionBalance), formula:'Loan provision accrues as the daily share of each fixed EMI across every calendar day in its EMI validity period. The rolling balance is provision accumulated minus loan payments.', rows:[['Provision accumulated',money(m.value.finance?.provisionAccumulated)],['Rolling provision balance',money(m.value.finance?.provisionBalance)],['Outstanding principal',money(m.value.finance?.outstandingPrincipal)],['Pending / overdue',money(m.value.finance?.totalOverdue)],['Delayed interest',money(m.value.finance?.totalUnpaidOverdueInterest)],['Actual loan paid',money(m.value.actualLoanPaid)],['Prepayments',money(m.value.actualPrepayment)]] },
  ]
})

function openDetail(key) { detailGroup.value = detailGroups.value.find(item => item.key === key) || null }
function toggleSection(key) { openSection.value = openSection.value === key ? null : key }
function choosePeriod(value) { period.value=value; openSection.value=null; detailGroup.value=null }
function applyCustom() { if(customFrom.value && customTo.value && customFrom.value<=customTo.value) { period.value='CUSTOM'; openSection.value=null } }
function movePeriod(amount) {
  const d=dayAtNoon(anchor.value)
  if(period.value==='MONTH') d.setUTCMonth(d.getUTCMonth()+amount)
  else if(period.value==='YEAR') d.setUTCFullYear(d.getUTCFullYear()+amount)
  else if(period.value==='WEEK') d.setUTCDate(d.getUTCDate()+amount*7)
  else d.setUTCDate(d.getUTCDate()+amount)
  anchor.value=d
}
function openDiagnosticFix(item) {
  if (!item?.target) return
  try {
    if (item.target.adminSection) localStorage.setItem('kfe-admin-navigation-v1', JSON.stringify({ adminSection:item.target.adminSection, selected:item.target.selected, settingsSelected:'backup' }))
  } catch (_e) {}
  void router.push(item.target.route)
}
function isProfit(value) { return value != null && value >= 0 }
function detailDiagnostics(group) {
  if (!group) return []
  if (group.key === 'provision' && diagnostics.value?.provision) return [diagnostics.value.provision]
  if (group.key === 'loan' && diagnostics.value?.loan) return [diagnostics.value.loan]
  return []
}
function detailCalculation(group) {
  if (!group) return []
  if (group.key === 'revenue') return [[money(m.value.revenue),'=','Σ shift-end revenue']]
  if (group.key === 'cost') return [[money(m.value.fuelCost),'+',money(m.value.toll),'+',money(m.value.parking),'+',money(m.value.actualMaintenance),'=',money(m.value.actualOperatingCost)]]
  if (group.key === 'indicativeProfit') return [[money(m.value.revenue),'−',money(m.value.totalIndicativeProvision),'=',money(indicativeProfit.value)]]
  if (group.key === 'actualProfit') return [[money(m.value.revenue),'−',money(m.value.actualOperatingCost),'=',money(actualProfit.value)]]
  if (group.key === 'revenueKm') return [[money(m.value.revenue),'÷',num(m.value.vehicleKm),'=',money2(m.value.revenuePerKm)]]
  if (group.key === 'revenueHour') return [[money(m.value.revenue),'÷',num(m.value.workingHours),'=',money2(m.value.revenuePerHour)]]
  if (group.key === 'fuelEconomy') return [[num(m.value.vehicleKm),'KM','÷',num(m.value.fuelQty),'KG','=',fuelEconomy.value == null ? '—' : num(fuelEconomy.value)+' KM/KG']]
  if (group.key === 'activity') return [['Shift closing odometer','−','shift start odometer','=','vehicle KM']]
  if (group.key === 'provision') return [['Loan provision','+','Maintenance provision','+','Compliance provision','=','Total provisions']]
  return []
}

async function refreshSnapshot() {
  try { snapshot.value = await PerformanceService.getSnapshot(); error.value='' }
  catch(e) { error.value=e?.message || 'Performance data could not be loaded.' }
}

onMounted(async()=>{ try { await refreshSnapshot() } finally { loading.value=false }; unsubscribeChanges=PerformanceService.subscribeDataChanges(()=>void refreshSnapshot()) })
onBeforeUnmount(()=>unsubscribeChanges())
</script>

<template>
  <section class="performance-page">
    <div v-if="loading" class="performance-state"><span class="spinner"></span><span>Loading performance…</span></div>
    <div v-else-if="error" class="performance-state performance-error"><strong>Performance unavailable</strong><span>{{ error }}</span></div>

    <template v-else-if="!detailGroup">
      <header class="performance-head">
        <div><small>PERFORMANCE</small><h1>Business position</h1><span>{{ periodLabel }}</span></div>
        <button class="today-button" @click="anchor=getKfeReferenceNow();period='MONTH'">Current</button>
      </header>

      <section class="period-bar" aria-label="Performance period">
        <div class="period-segment">
          <button v-for="item in periodOptions" :key="item" :class="{active:period===item}" @click="choosePeriod(item)">{{ item==='SYNTHETIC' ? '5 YEARS' : item }}</button>
        </div>
        <div v-if="period!=='CUSTOM'&&period!=='SYNTHETIC'" class="period-nav"><button @click="movePeriod(-1)" aria-label="Previous period">‹</button><strong>{{ periodLabel }}</strong><button @click="movePeriod(1)" aria-label="Next period">›</button></div>
        <div v-else-if="period==='CUSTOM'" class="custom-dates"><label>From<input v-model="customFrom" type="date"></label><label>To<input v-model="customTo" type="date"></label><button :disabled="!customFrom||!customTo||customFrom>customTo" @click="applyCustom">Apply</button></div>
      </section>

      <section class="profit-result">
        <div class="profit-result-head"><div><small>BUSINESS PROFIT</small><h2>Indicative vs actual</h2><span>Two independent views of the same selected period</span></div></div>
        <div class="profit-grid">
          <button class="profit-card indicative" @click="openDetail('indicativeProfit')">
            <small>INDICATIVE PROFIT</small><strong>{{ money(indicativeProfit) }}</strong><b :class="isProfit(indicativeProfit)?'profit':'loss'">{{ isProfit(indicativeProfit) ? 'PROFIT' : 'LOSS' }}</b>
            <span>Revenue − provisions</span>
          </button>
          <button class="profit-card actual" @click="openDetail('actualProfit')">
            <small>ACTUAL PROFIT</small><strong>{{ money(actualProfit) }}</strong><b :class="isProfit(actualProfit)?'profit':'loss'">{{ isProfit(actualProfit) ? 'PROFIT' : 'LOSS' }}</b>
            <span>Revenue − actual operating expenses</span>
          </button>
        </div>
        <div class="profit-bridge">
          <button @click="openDetail('revenue')"><span>Revenue</span><strong>{{ money(m.revenue) }}</strong></button>
          <i>−</i><button @click="openDetail('provision')"><span>Period provisions</span><strong>{{ money(indicativeProvision) }}</strong></button>
          <i>=</i><button @click="openDetail('indicativeProfit')"><span>Indicative profit</span><strong>{{ money(indicativeProfit) }}</strong></button>
        </div>
        <div class="profit-actual-line"><span>Actual operating expenses</span><strong>{{ money(m.actualOperatingCost) }}</strong><button @click="openDetail('actualProfit')">View actual calculation ›</button></div>
      </section>

      <section class="efficiency-strip">
        <button @click="openDetail('revenueKm')"><small>REVENUE / KM</small><strong>{{ money2(m.revenuePerKm) }}</strong></button>
        <button @click="openDetail('revenueHour')"><small>REVENUE / HOUR</small><strong>{{ money2(m.revenuePerHour) }}</strong></button>
        <button @click="openDetail('fuelEconomy')"><small>FUEL ECONOMY</small><strong>{{ fuelEconomy == null ? '—' : num(fuelEconomy) + ' KM/KG' }}</strong></button>
      </section>

      <section v-if="syntheticSummary" class="synthetic-result-card">
        <div class="section-head"><div><small>SYNTHETIC · FULL HISTORY</small><h2>5-year calculation result</h2></div><span>Engine output</span></div>
        <div class="synthetic-result-grid">
          <div><span>History</span><strong>{{ syntheticSummary.shifts.toLocaleString('en-IN') }} shifts</strong><small>{{ syntheticSummary.observedDays?.toLocaleString('en-IN') }} observed operating days</small></div>
          <div><span>Operating KM forecast</span><strong>{{ syntheticSummary.dailyForecast == null ? '—' : syntheticSummary.dailyForecast.toFixed(4) }} KM/day</strong><small>Full-history frozen forecast</small></div>
          <div><span>KM → Driver Target multiplier</span><strong>{{ syntheticSummary.multiplier == null ? '—' : syntheticSummary.multiplier.toFixed(6) }}×</strong><small>Authoritative target volume multiplier</small></div>
        </div>
        <p>These values are calculated from the loaded synthetic IndexedDB history through the same Performance → Forecast → Driver Target path used by the contract tests.</p>
      </section>

      <section class="outlook-card">
        <div class="section-head"><div><small>BUSINESS OUTLOOK</small><h2>What is required / expected?</h2></div><span>Indicative underneath</span></div>
        <div class="outlook-grid">
          <button v-for="item in outlookItems" :key="item.key" :class="['outlook-item',item.state]" @click="item.key==='target'||item.key==='breakEven' ? openDetail(item.key==='target'?'target':'breakEven') : openSection='outlook'">
            <span>{{ item.label }}</span><strong>{{ item.value }}</strong><small>{{ item.sub }}</small>
          </button>
        </div>
        <div v-if="openSection==='outlook'" class="outlook-detail">
          <div><span>Observed operating KM</span><strong>{{ num(forecast?.observedKm) }}</strong></div>
          <div><span>Calculated daily KM forecast</span><strong>{{ num(forecast?.calculatedForecast?.dailyKm) }}</strong></div>
          <div><span>Period KM outlook</span><strong>{{ num(forecastKm) }}</strong></div>
          <p>Forecast remains calculated from operational evidence. Manual override UI is intentionally hidden.</p>
        </div>
      </section>

      <section class="business-section">
        <div class="section-head"><div><small>BUSINESS ENGINE</small><h2>How the operation creates the result</h2></div></div>
        <div class="flow-card">
          <button @click="toggleSection('activity')"><span><small>OPERATING ACTIVITY</small><b>How did we operate?</b></span><strong>{{ num(m.vehicleKm) }} KM</strong><i>⌄</i></button>
          <div v-if="openSection==='activity'" class="section-body">
            <div class="activity-metrics"><button @click="openDetail('activity')"><span>Operating KM</span><strong>{{ num(m.vehicleKm) }}</strong></button><button @click="openDetail('activity')"><span>Working hours</span><strong>{{ num(m.workingHours) }}</strong></button><button @click="openDetail('activity')"><span>Trips</span><strong>{{ num(m.counts?.trips) }}</strong></button></div>
            <div class="utilisation"><div class="bar-label"><span>Revenue-generating KM</span><b>{{ num(businessKm) }} KM</b></div><div class="bar"><span :style="{width:revenueKmPct+'%'}"></span></div><div class="bar-label"><span>Dead KM</span><b>{{ num(deadKm) }} KM</b></div><p>{{ deadKmPct.toFixed(1) }}% of operating KM is non-business KM.</p></div>
          </div>
        </div>

        <div class="flow-card">
          <button @click="toggleSection('money')"><span><small>MONEY FLOW</small><b>Where did the money go?</b></span><strong>{{ money(m.actualOperatingCost) }}</strong><i>⌄</i></button>
          <div v-if="openSection==='money'" class="section-body">
            <div class="cost-bars">
              <button v-for="item in [{key:'fuel',label:'Fuel',value:m.fuelCost},{key:'toll',label:'Toll',value:m.toll},{key:'parking',label:'Parking',value:m.parking},{key:'maintenance',label:'Actual maintenance',value:m.actualMaintenance}]" :key="item.key" @click="openDetail('cost')">
                <span><b>{{ item.label }}</b><small>{{ money(item.value) }}</small></span><div class="cost-track"><i :style="{width:(m.actualOperatingCost>0 ? Math.max(0,Math.min(100,Number(item.value||0)/m.actualOperatingCost*100)) : 0)+'%'}"></i></div>
              </button>
            </div>
          </div>
        </div>

        <div class="flow-card">
          <button @click="toggleSection('economics')"><span><small>BUSINESS EFFICIENCY</small><b>Unit economics</b></span><strong>{{ money2(m.revenuePerKm) }}/KM</strong><i>⌄</i></button>
          <div v-if="openSection==='economics'" class="section-body">
            <div class="unit-grid">
              <button @click="openDetail('revenueKm')"><small>Revenue / KM</small><strong>{{ money2(m.revenuePerKm) }}</strong></button>
              <button @click="openDetail('revenueHour')"><small>Revenue / Hour</small><strong>{{ money2(m.revenuePerHour) }}</strong></button>
              <button @click="openDetail('fuelEconomy')"><small>CNG Economy</small><strong>{{ fuelEconomy == null ? '—' : num(fuelEconomy)+' KM/KG' }}</strong></button>
              <button @click="openDetail('fuelEconomy')"><small>Fuel / KM</small><strong>{{ money2(m.fuelCostPerKm) }}</strong></button>
            </div>
          </div>
        </div>

        <div class="flow-card">
          <button @click="toggleSection('position')"><span><small>PROVISIONS</small><b>Loan · Maintenance · Compliance</b></span><strong>View</strong><i>⌄</i></button>
          <div v-if="openSection==='position'" class="section-body">
            <div class="position-grid">
              <button @click="openDetail('provision')"><span>Loan provision</span><strong>{{ money(m.loanProvisionForPeriod) }}</strong></button>
              <button @click="openDetail('provision')"><span>Maintenance provision</span><strong>{{ money(m.maintenanceProvision) }}</strong></button>
              <button @click="openDetail('provision')"><span>Compliance provision</span><strong>{{ money(m.renewalProvision) }}</strong></button>
            </div>
            <p class="separation-note">Each amount is the provision allocated for the selected period. Loan and compliance accrue by calendar-day validity; maintenance accrues from actual KM.</p>
          </div>
        </div>
      </section>

      <section v-if="Object.keys(diagnostics).length" class="diagnostics-preview">
        <div class="section-head"><div><small>DIAGNOSTICS</small><h2>Something needs attention</h2></div><span>{{ Object.keys(diagnostics).length }}</span></div>
        <button v-for="item in Object.values(diagnostics)" :key="item.id" @click="openDetail(item.calculation==='Monthly Break-even'?'breakEven':item.calculation==='Driver Target'?'target':'provision')">
          <span><b>{{ item.rootCause }}</b><small>{{ item.why }}</small></span><i>›</i>
        </button>
      </section>

      <section class="calculation-hint"><small>CALCULATIONS &amp; EVIDENCE</small><p>Tap any business number to see its exact inputs, formula and source evidence. Diagnostics appear with the affected calculation.</p></section>
    </template>

    <template v-else>
      <header class="detail-head"><button @click="detailGroup=null" aria-label="Back">‹</button><div><small>PERFORMANCE · {{ detailGroup.kicker }}</small><h1>{{ detailGroup.title }}</h1><span>{{ periodLabel }}</span></div></header>

      <section class="detail-hero"><small>{{ detailGroup.kicker }}</small><strong>{{ detailGroup.value }}</strong></section>

      <section class="calculation-card">
        <div><small>EXACT CALCULATION</small><p>{{ detailGroup.formula }}</p></div>
        <div class="equations"><div v-for="(line,index) in detailCalculation(detailGroup)" :key="index"><span v-for="(part,i) in line" :key="i" :class="{operator:['+','−','÷','×','=','Σ'].includes(part)}">{{ part }}</span></div></div>
      </section>

      <section class="detail-card">
        <div class="section-head"><div><small>SUPPORTING FACTS</small><h2>What makes this number?</h2></div></div>
        <div class="fact-list"><div v-for="row in detailGroup.rows" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
      </section>

      <section v-if="detailDiagnostics(detailGroup).length" class="diagnostic-detail">
        <div class="section-head"><div><small>DIAGNOSTIC</small><h2>Why / dependency / fix</h2></div></div>
        <article v-for="item in detailDiagnostics(detailGroup)" :key="item.id">
          <div class="diag-title"><b>{{ item.rootCause }}</b><span>{{ item.status }}</span></div>
          <div class="diag-grid"><div><small>WHY</small><p>{{ item.why }}</p></div><div><small>FIX</small><p>{{ item.fix }}</p></div></div>
          <div class="chain"><small>DEPENDENCY PATH</small><div><template v-for="(step,index) in item.chain" :key="step"><b>{{ step }}</b><i v-if="index<item.chain.length-1">→</i></template></div></div>
          <button v-if="item.target" @click="openDiagnosticFix(item)">Fix this <span>→</span></button>
        </article>
      </section>

      <section v-if="detailGroup.key==='loan'" class="detail-card">
        <div class="section-head"><div><small>EMI-WISE</small><h2>Delayed / unpaid EMIs</h2></div></div>
        <div class="emi-list">
          <div v-for="row in (m.finance?.overdue || [])" :key="row.dueDate">
            <span>Due date <b>{{ row.dueDate }}</b></span>
            <span>EMI amount <b>{{ money2(row.originalEmiAmount) }}</b></span>
            <span>Delayed interest <b>{{ money2(row.unpaidOverdueInterest) }}</b></span>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>
