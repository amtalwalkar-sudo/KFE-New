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
const profit = computed(() => finite(m.value.operatingProfit))
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
    { key:'profit', title:'Operating profit', kicker:'ACTUAL', value:money(profit.value), formula:'Operating Profit = Revenue − Operating Cost.', rows:[['Revenue',money(m.value.revenue)],['Operating cost',money(cost)],['Operating profit',money(profit.value)]] },
    { key:'revenueKm', title:'Revenue / KM', kicker:'ACTUAL', value:money2(m.value.revenuePerKm), formula:'Revenue / KM = authoritative revenue ÷ authoritative vehicle KM.', rows:[['Revenue',money(m.value.revenue)],['Vehicle KM',num(m.value.vehicleKm)],['Revenue / KM',money2(m.value.revenuePerKm)]] },
    { key:'revenueHour', title:'Revenue / hour', kicker:'ACTUAL', value:money2(m.value.revenuePerHour), formula:'Revenue / hour = authoritative revenue ÷ qualifying working hours from completed shifts.', rows:[['Revenue',money(m.value.revenue)],['Working hours',num(m.value.workingHours)],['Revenue / hour',money2(m.value.revenuePerHour)]] },
    { key:'fuelEconomy', title:'Fuel economy', kicker:'ACTUAL', value:fuelEconomy.value == null ? '—' : `${num(fuelEconomy.value)} KM/KG`, formula:'Fuel economy = authoritative vehicle KM ÷ recorded CNG quantity in KG.', rows:[['Vehicle KM',num(m.value.vehicleKm)],['CNG consumed',m.value.fuelQty == null ? '—' : `${num(m.value.fuelQty)} KG`],['Fuel economy',fuelEconomy.value == null ? '—' : `${num(fuelEconomy.value)} KM/KG`],['Fuel cost / KG',money2(fuelCostPerKg.value)]] },
    { key:'activity', title:'Operating activity', kicker:'ACTUAL', value:num(m.value.vehicleKm) + ' KM', formula:'Operating KM comes from qualifying shift closing odometer minus start odometer. Business KM comes from validated completed-trip KM.', rows:[['Vehicle KM',num(m.value.vehicleKm)],['Revenue-generating KM',num(businessKm.value)],['Dead KM',num(deadKm.value)],['Working hours',num(m.value.workingHours)],['Completed trips',num(m.value.counts?.trips)]] },
    { key:'provision', title:'Provisions', kicker:'PROVISIONS', value:money(m.value.provisionRequired), formula:'Provisions are shown separately by obligation type. Loan and compliance are fixed-validity provisions; maintenance is usage-based from actual vehicle KM.', rows:[['Loan provision',money(m.value.finance?.provisionAccumulated)],['Maintenance provision',money(m.value.maintenanceProvision)],['Compliance provision',money(m.value.renewalProvision)],['Total provisions',money((Number(m.value.finance?.provisionAccumulated)||0)+(Number(m.value.maintenanceProvision)||0)+(Number(m.value.renewalProvision)||0))]] },
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
function isProfit() { return profit.value != null && profit.value >= 0 }
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
  if (group.key === 'profit') return [[money(m.value.revenue),'−',money(m.value.actualOperatingCost),'=',money(profit.value)]]
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

      <section class="business-result">
        <div class="result-copy"><small>BUSINESS RESULT</small><h2>{{ money(profit) }}</h2><b :class="isProfit()?'profit':'loss'">{{ isProfit() ? 'OPERATING PROFIT' : 'OPERATING LOSS' }}</b></div>
        <div class="money-flow">
          <button @click="openDetail('revenue')"><span>Revenue</span><strong>{{ money(m.revenue) }}</strong></button>
          <i>−</i>
          <button @click="openDetail('cost')"><span>Operating cost</span><strong>{{ money(m.actualOperatingCost) }}</strong></button>
          <i>=</i>
          <button @click="openDetail('profit')"><span>Operating result</span><strong>{{ money(profit) }}</strong></button>
        </div>
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
              <button @click="openDetail('provision')"><span>Loan provision</span><strong>{{ money(m.finance?.provisionAccumulated) }}</strong></button>
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

<style scoped>
.performance-page{min-height:calc(100dvh - 12px);padding:12px 14px 72px;display:grid;gap:14px;color:var(--kfe-ui-text);background:var(--kfe-ui-bg)}
.performance-head,.detail-head,.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.performance-head h1,.detail-head h1{margin:.12rem 0 0;font-size:clamp(1.45rem,5vw,2rem);letter-spacing:-.04em}.performance-head span,.detail-head span{display:block;color:var(--kfe-muted-text);font-size:.7rem;margin-top:3px}.performance-head small,.detail-head small,.section-head small,.business-result small,.efficiency-strip small,.flow-card button small,.detail-hero small,.calculation-card>div>small,.diagnostic-detail small,.diagnostics-preview small,.calculation-hint small{font-size:.62rem;font-weight:900;letter-spacing:.12em;color:var(--kfe-muted-text)}
.today-button,.period-segment button,.period-nav button,.custom-dates button{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);color:var(--kfe-ui-text);border-radius:12px;min-height:42px;padding:0 12px;font-weight:850}.today-button{font-size:.7rem}.period-bar{display:grid;gap:9px}.period-segment{display:flex;gap:5px;overflow:auto;scrollbar-width:none}.period-segment button{white-space:nowrap;font-size:.7rem}.period-segment button.active{background:var(--kfe-accent);border-color:var(--kfe-accent);color:var(--kfe-ui-on-accent,#fff)}.period-nav{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;gap:6px}.period-nav strong{text-align:center;font-size:.82rem}.custom-dates{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end}.custom-dates label{display:grid;gap:4px;font-size:.62rem;font-weight:800;color:var(--kfe-muted-text)}.custom-dates input{min-height:42px;border:1px solid var(--kfe-ui-border);border-radius:11px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text);padding:0 8px}
.business-result,.efficiency-strip,.outlook-card,.business-section,.diagnostics-preview,.calculation-hint,.detail-hero,.calculation-card,.detail-card,.diagnostic-detail{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);border-radius:22px}.business-result{padding:18px;display:grid;gap:15px}.result-copy{display:grid;gap:4px}.result-copy h2{margin:0;font-size:clamp(2.8rem,14vw,5rem);line-height:.9;letter-spacing:-.07em;font-weight:950;font-variant-numeric:tabular-nums}.result-copy b{font-size:.7rem;letter-spacing:.12em}.profit{color:var(--kfe-success)}.loss{color:var(--kfe-danger)}.money-flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:stretch;gap:5px}.money-flow button{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-bg);color:inherit;border-radius:14px;padding:10px 8px;text-align:left;display:grid;gap:4px}.money-flow span{font-size:.62rem;color:var(--kfe-muted-text)}.money-flow strong{font-size:.85rem}.money-flow i{display:grid;place-items:center;color:var(--kfe-muted-text);font-style:normal;font-weight:900}.efficiency-strip{display:grid;grid-template-columns:repeat(3,1fr);overflow:hidden}.efficiency-strip button{min-height:82px;border:0;border-right:1px solid var(--kfe-ui-border);background:transparent;color:inherit;text-align:left;padding:12px}.efficiency-strip button:last-child{border-right:0}.efficiency-strip strong{display:block;margin-top:6px;font-size:1rem;font-weight:950;font-variant-numeric:tabular-nums}.outlook-card,.business-section,.diagnostics-preview{padding:16px}.section-head{align-items:flex-start}.section-head h2{margin:3px 0 0;font-size:1.05rem}.section-head>span{font-size:.63rem;color:var(--kfe-muted-text);text-align:right}.outlook-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.outlook-item{min-height:112px;border:1px solid var(--kfe-ui-border);border-radius:15px;background:var(--kfe-ui-bg);color:inherit;text-align:left;padding:12px;display:grid;align-content:center;gap:5px}.outlook-item span{font-size:.66rem;color:var(--kfe-muted-text)}.outlook-item strong{font-size:1rem;font-weight:950}.outlook-item small{font-size:.62rem;color:var(--kfe-muted-text);line-height:1.35}.outlook-item.done{border-color:var(--kfe-success)}.outlook-item.open{border-color:var(--kfe-warning)}.outlook-detail{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--kfe-ui-border)}.outlook-detail div{display:grid;gap:4px}.outlook-detail span,.outlook-detail p{font-size:.65rem;color:var(--kfe-muted-text)}.outlook-detail strong{font-size:.82rem}.outlook-detail p{grid-column:1/-1;margin:2px 0 0}
.business-section{display:grid;gap:9px}.flow-card{border:1px solid var(--kfe-ui-border);border-radius:17px;overflow:hidden;background:var(--kfe-ui-bg)}.flow-card>button{width:100%;border:0;background:transparent;color:inherit;min-height:68px;padding:11px 13px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:10px;text-align:left}.flow-card>button b{display:block;margin-top:3px;font-size:.92rem}.flow-card>button>strong{font-size:.78rem}.flow-card>button>i{font-style:normal;color:var(--kfe-muted-text);font-size:1.15rem}.section-body{padding:0 13px 13px;border-top:1px solid var(--kfe-ui-border);animation:expand-in .22s ease both}.activity-metrics,.unit-grid,.position-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding-top:11px}.activity-metrics button,.unit-grid button,.position-grid button{border:1px solid var(--kfe-ui-border);border-radius:13px;background:var(--kfe-ui-surface);color:inherit;padding:10px;text-align:left;display:grid;gap:4px}.activity-metrics span,.position-grid span{font-size:.62rem;color:var(--kfe-muted-text)}.activity-metrics strong,.unit-grid strong,.position-grid strong{font-size:.82rem}.utilisation{margin-top:13px}.bar-label{display:flex;justify-content:space-between;gap:8px;font-size:.65rem;color:var(--kfe-muted-text)}.bar-label b{color:var(--kfe-ui-text)}.bar{height:12px;border-radius:999px;background:color-mix(in srgb,var(--kfe-ui-text) 10%,var(--kfe-ui-surface));overflow:hidden;margin:7px 0}.bar span{display:block;height:100%;border-radius:inherit;background:var(--kfe-accent);transform-origin:left;animation:fill-in .55s ease both}.utilisation p,.separation-note{font-size:.65rem;line-height:1.45;color:var(--kfe-muted-text);margin:7px 0 0}.cost-bars{display:grid;gap:9px;padding-top:11px}.cost-bars button{border:0;background:transparent;color:inherit;padding:0;text-align:left}.cost-bars button>span{display:flex;justify-content:space-between;gap:8px;font-size:.68rem}.cost-bars small{color:var(--kfe-muted-text)}.cost-track{height:9px;border-radius:999px;background:color-mix(in srgb,var(--kfe-ui-text) 10%,var(--kfe-ui-surface));margin-top:5px;overflow:hidden}.cost-track i{display:block;height:100%;border-radius:inherit;background:var(--kfe-accent);transform-origin:left;animation:fill-in .5s ease both}.diagnostics-preview{display:grid;gap:8px}.diagnostics-preview>button{border:1px solid var(--kfe-ui-border);border-radius:14px;background:var(--kfe-ui-bg);color:inherit;padding:11px 12px;display:flex;justify-content:space-between;align-items:center;text-align:left}.diagnostics-preview>button span{display:grid;gap:4px}.diagnostics-preview>button b{font-size:.78rem}.diagnostics-preview>button small{font-size:.65rem;letter-spacing:0}.diagnostics-preview>button i{font-style:normal;font-size:1.3rem;color:var(--kfe-muted-text)}.calculation-hint{padding:14px 16px}.calculation-hint p{margin:5px 0 0;font-size:.7rem;line-height:1.5;color:var(--kfe-muted-text)}
.detail-head{justify-content:flex-start}.detail-head>button{width:44px;height:44px;border:1px solid var(--kfe-ui-border);border-radius:13px;background:var(--kfe-ui-surface);color:inherit;font-size:1.6rem}.detail-head>div{flex:1}.detail-hero{padding:20px;display:grid;gap:6px}.detail-hero strong{font-size:clamp(2.2rem,11vw,4rem);line-height:.95;letter-spacing:-.06em;font-weight:950}.calculation-card,.detail-card,.diagnostic-detail{padding:16px;display:grid;gap:12px}.calculation-card p{margin:5px 0 0;font-size:.76rem;line-height:1.5}.equations{display:grid;gap:8px}.equations>div{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:12px;border-radius:14px;background:var(--kfe-ui-bg);border:1px solid var(--kfe-ui-border);font-size:.76rem;font-weight:850}.equations .operator{color:var(--kfe-accent);font-size:1rem}.fact-list{display:grid}.fact-list>div{min-height:47px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--kfe-ui-border);font-size:.72rem}.fact-list>div:last-child{border-bottom:0}.fact-list span{color:var(--kfe-muted-text)}.fact-list strong{text-align:right}.diagnostic-detail article{border:1px solid var(--kfe-ui-border);border-radius:16px;background:var(--kfe-ui-bg);padding:13px;display:grid;gap:11px}.diag-title{display:flex;justify-content:space-between;gap:10px}.diag-title b{font-size:.82rem}.diag-title span{font-size:.62rem;color:var(--kfe-warning);font-weight:900}.diag-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.diag-grid p{margin:4px 0 0;font-size:.7rem;line-height:1.45}.chain{display:grid;gap:6px}.chain>div{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.chain b{font-size:.64rem}.chain i{font-style:normal;color:var(--kfe-muted-text)}.diagnostic-detail article>button{min-height:42px;border:0;border-radius:12px;background:var(--kfe-accent);color:var(--kfe-ui-on-accent,#fff);font-weight:900;padding:0 13px;justify-self:start}.emi-list{display:grid}.emi-list>div{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:11px 0;border-bottom:1px solid var(--kfe-ui-border);font-size:.68rem}.emi-list>div:last-child{border-bottom:0}.emi-list span{display:grid;gap:3px;color:var(--kfe-muted-text)}.emi-list b{color:var(--kfe-ui-text)}
.performance-state{min-height:50vh;display:grid;place-items:center;align-content:center;gap:8px;text-align:center}.performance-error{color:var(--kfe-danger)}.spinner{width:24px;height:24px;border:3px solid var(--kfe-ui-border);border-top-color:var(--kfe-accent);border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes fill-in{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes expand-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media(max-width:560px){.money-flow{grid-template-columns:1fr;gap:6px}.money-flow i{display:none}.outlook-grid{grid-template-columns:1fr 1fr}.activity-metrics,.unit-grid,.position-grid{grid-template-columns:1fr 1fr}.outlook-item:last-child{grid-column:1/-1}.diag-grid,.emi-list{grid-template-columns:1fr}.efficiency-strip strong{font-size:.82rem}.efficiency-strip button{min-height:88px;padding:10px 8px}}
@media(min-width:700px){.performance-page{width:min(100%,980px);margin:0 auto;padding-inline:22px}}
@media(prefers-reduced-motion:reduce){.bar span,.cost-track i,.section-body,.spinner{animation:none}}
</style>
