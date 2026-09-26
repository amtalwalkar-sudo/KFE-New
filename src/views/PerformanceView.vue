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
const actualProfit = computed(() => finite(m.value.performanceHeadlineActualProfit ?? m.value.actualProfit ?? m.value.operatingProfit))
const indicativeProfit = computed(() => finite(m.value.performanceHeadlineProvisionalProfit ?? m.value.indicativeProfit))
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

const formatDateShort = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', day:'numeric', month:'short' }).format(date)
    : '—'
}
const formatDateLong = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', day:'numeric', month:'short', year:'numeric' }).format(date)
    : '—'
}
const formatDay = value => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', weekday:'short', day:'numeric', month:'short' }).format(date)
    : '—'
}
const businessTimeline = computed(() => {
  const shifts = (m.value.shifts || []).filter(row => row?.shiftEndAt || row?.shiftStartAt)
  const byDay = new Map()
  for (const shift of shifts) {
    const stamp = shift.shiftEndAt || shift.shiftStartAt
    const key = istParts(stamp)
    if (!key) continue
    const id = `${key.year}-${String(key.month).padStart(2,'0')}-${String(key.day).padStart(2,'0')}`
    const existing = byDay.get(id) || { id, date: stamp, revenue:0 }
    existing.revenue += Number(shift.revenue) || 0
    byDay.set(id, existing)
  }
  return [...byDay.values()].sort((a,b)=>new Date(a.date)-new Date(b.date))
})
const timelineVisible = computed(() => {
  const rows = businessTimeline.value
  if (!rows.length) return []
  if (period.value === 'DAY') return rows.slice(-1)
  if (rows.length <= 12) return rows
  const step = Math.ceil(rows.length / 12)
  return rows.filter((_, index) => index % step === 0 || index === rows.length - 1)
})
const currentTimelineId = computed(() => {
  const p = istParts(anchor.value)
  return p ? `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}` : ''
})
const loanJourney = computed(() => {
  const finance = m.value.finance || {}
  const schedule = Array.isArray(finance.schedule) ? finance.schedule.filter(row => row?.dueDate).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)) : []
  const milestones = []
  if (schedule.length) {
    const picks = [0, Math.floor((schedule.length-1)*0.33), Math.floor((schedule.length-1)*0.66), schedule.length-1]
    for (const index of [...new Set(picks)]) {
      const row = schedule[index]
      milestones.push({ key:`emi-${index}`, label:`EMI ${index+1}`, date:row.dueDate, amount:money(row.originalEmiAmount) })
    }
  }
  const outstanding = finite(finance.outstandingPrincipal)
  return { schedule, milestones, outstanding, paid: schedule.filter(row => new Date(row.dueDate) <= anchor.value).length, total: schedule.length, start: schedule[0]?.dueDate || null, end: schedule.at(-1)?.dueDate || null }
})
const refuelTrail = computed(() => (m.value.fuelLogs || [])
  .filter(row => row?.capturedAt)
  .slice()
  .sort((a,b)=>new Date(a.capturedAt)-new Date(b.capturedAt))
  .slice(-6))
const expenseItems = computed(() => [
  { label:'Fuel', value:finite(m.value.fuelCost) || 0 },
  { label:'Maintenance', value:finite(m.value.actualMaintenance) || 0 },
  { label:'Toll', value:finite(m.value.toll) || 0 },
  { label:'Parking', value:finite(m.value.parking) || 0 },
])
const periodContext = computed(() => periodLabel.value)

</script>

<template>
  <section class="performance-page performance-premium">
    <div v-if="loading" class="performance-state"><span class="spinner"></span><span>Loading performance…</span></div>
    <div v-else-if="error" class="performance-state performance-error"><strong>Performance unavailable</strong><span>{{ error }}</span></div>

    <template v-else>
      <header class="pp-header">
        <div class="pp-title">
          <span class="pp-eyebrow">PERFORMANCE</span>
          <h1>Business Position</h1>
          <p>{{ periodContext }}</p>
        </div>
        <button class="pp-current" @click="anchor=getKfeReferenceNow();period='DAY'">Today</button>
      </header>

      <nav class="pp-period" aria-label="Performance period">
        <button v-for="item in ['DAY','WEEK','MONTH']" :key="item" :class="{active:period===item}" @click="choosePeriod(item)">
          <span>{{ item }}</span><i></i>
        </button>
      </nav>

      <div class="pp-period-nav">
        <button @click="movePeriod(-1)" aria-label="Previous period">‹</button>
        <span>{{ periodLabel }}</span>
        <button @click="movePeriod(1)" aria-label="Next period">›</button>
      </div>

      <section class="pp-position">
        <div class="pp-section-index">01</div>
        <div class="pp-section-heading">
          <span>BUSINESS POSITION</span>
          <h2>Where the business stands</h2>
        </div>

        <div class="pp-profit-pair">
          <article class="pp-profit actual">
            <span>ACTUAL PROFIT / LOSS</span>
            <strong>{{ money(actualProfit) }}</strong>
            <small>Full EMI included</small>
          </article>
          <div class="pp-bridge-line"><i></i><span></span><i></i></div>
          <article class="pp-profit provisional">
            <span>PROVISIONAL PROFIT / LOSS</span>
            <strong>{{ money(indicativeProfit) }}</strong>
            <small>Full EMI + provisions included</small>
          </article>
        </div>

        <div class="pp-context-strip">
          <div><strong>{{ money(m.revenue) }}</strong><span>Revenue</span></div>
          <div><strong>{{ num(m.vehicleKm) }}</strong><span>Vehicle KM</span></div>
          <div><strong>{{ num(refuelTrail.length) }}</strong><span>Refuelling events</span></div>
        </div>
      </section>

      <section class="pp-section pp-timeline-section">
        <div class="pp-section-index">02</div>
        <div class="pp-section-heading">
          <span>BUSINESS TIMELINE</span>
          <h2>Activity through the period</h2>
        </div>
        <div class="pp-timeline" :class="{empty:!timelineVisible.length}">
          <div class="pp-timeline-line"></div>
          <div v-for="point in timelineVisible" :key="point.id" class="pp-time-point" :class="{today:point.id===currentTimelineId}">
            <div class="pp-node"></div>
            <div class="pp-point-copy">
              <span>{{ formatDay(point.date) }}</span>
              <strong>{{ money(point.revenue) }}</strong>
            </div>
          </div>
          <div v-if="!timelineVisible.length" class="pp-empty">— No activity in this period</div>
        </div>
      </section>

      <section class="pp-section pp-loan">
        <div class="pp-section-index">03</div>
        <div class="pp-section-heading">
          <span>LOAN POSITION</span>
          <h2>Loan journey</h2>
        </div>
        <div v-if="loanJourney.total" class="pp-loan-journey">
          <div class="pp-loan-track"></div>
          <div class="pp-loan-start">
            <span>START</span><strong>{{ money(m.finance?.originalPrincipal) }}</strong>
          </div>
          <div v-for="item in loanJourney.milestones" :key="item.key" class="pp-loan-milestone">
            <i></i><span>{{ item.label }}</span><small>{{ formatDateShort(item.date) }}</small>
          </div>
          <div class="pp-loan-now">
            <i></i><span>TODAY</span><strong>{{ money(loanJourney.outstanding) }}</strong>
          </div>
          <div class="pp-loan-end">
            <span>END</span><small>{{ formatDateShort(loanJourney.end) }}</small>
          </div>
        </div>
        <div v-else class="pp-empty">— No active loan position</div>
        <div v-if="loanJourney.total" class="pp-loan-meta">
          <span>{{ loanJourney.paid }} EMIs passed</span>
          <span>{{ Math.max(0, loanJourney.total-loanJourney.paid) }} remaining</span>
          <span>Outstanding {{ money(loanJourney.outstanding) }}</span>
        </div>
      </section>

      <section class="pp-section pp-fuel">
        <div class="pp-section-index">04</div>
        <div class="pp-section-heading">
          <span>REFUELLING</span>
          <h2>Fuel trail</h2>
        </div>
        <div class="pp-fuel-summary">
          <div><strong>{{ money(m.fuelCost) }}</strong><span>Total spend</span></div>
          <div><strong>{{ num(m.fuelQty) }} kg</strong><span>Quantity</span></div>
          <div><strong>{{ refuelTrail.length }}</strong><span>Stops shown</span></div>
        </div>
        <div class="pp-fuel-trail" :class="{empty:!refuelTrail.length}">
          <div class="pp-fuel-line"></div>
          <article v-for="row in refuelTrail" :key="row.id || row.capturedAt" class="pp-fuel-stop">
            <i></i>
            <div><span>{{ formatDateShort(row.capturedAt) }}</span><strong>{{ num(row.quantityKg) }} kg</strong></div>
            <small>{{ money(row.amount) }} · {{ money2(row.pricePerKg) }}/kg</small>
          </article>
          <div v-if="!refuelTrail.length" class="pp-empty">— No refuelling activity</div>
        </div>
      </section>

      <section class="pp-section pp-expenses">
        <div class="pp-section-index">05</div>
        <div class="pp-section-heading">
          <span>EXPENSE BREAKDOWN</span>
          <h2>Operating expenses</h2>
        </div>
        <div class="pp-expense-strip">
          <div v-for="item in expenseItems" :key="item.label" class="pp-expense">
            <span>{{ item.label }}</span>
            <strong>{{ money(item.value) }}</strong>
            <i><b :style="{width:(m.actualOperatingCost>0 ? Math.min(100,item.value/m.actualOperatingCost*100) : 0)+'%'}"></b></i>
          </div>
        </div>
      </section>

      <section class="pp-section pp-break-even">
        <div class="pp-section-index">06</div>
        <div class="pp-section-heading">
          <span>BREAK-EVEN</span>
          <h2>Required position</h2>
        </div>
        <div class="pp-focus">
          <div class="pp-focus-ring"><span>BREAK-EVEN</span><strong>{{ money(breakEven) }}</strong></div>
          <div class="pp-focus-line"><i></i></div>
        </div>
      </section>

      <section class="pp-section pp-target">
        <div class="pp-section-index">07</div>
        <div class="pp-section-heading">
          <span>TARGET / PACE</span>
          <h2>Driver target</h2>
        </div>
        <div class="pp-target-line">
          <div><span>TARGET</span><strong>{{ money(target) }}</strong></div>
          <div class="pp-target-track"><i></i><b></b></div>
          <div><span>REVENUE</span><strong>{{ money(targetRevenue) }}</strong></div>
        </div>
      </section>

      <section class="pp-section pp-fleet">
        <div class="pp-section-index">08</div>
        <div class="pp-section-heading">
          <span>FLEET EFFICIENCY</span>
          <h2>Operating profile</h2>
        </div>
        <div class="pp-metric-strip">
          <div><strong>{{ num(m.vehicleKm) }}</strong><span>Vehicle KM</span></div>
          <div><strong>{{ num(businessKm) }}</strong><span>Business KM</span></div>
          <div><strong>{{ num(deadKm) }}</strong><span>Dead KM</span></div>
          <div><strong>{{ fuelEconomy==null ? '—' : num(fuelEconomy) }}</strong><span>KM / KG</span></div>
        </div>
      </section>

      <section class="pp-section pp-recovery">
        <div class="pp-section-index">09</div>
        <div class="pp-section-heading">
          <span>RECOVERY &amp; PROVISIONS</span>
          <h2>Provision journey</h2>
        </div>
        <div class="pp-recovery-line">
          <div><i></i><span>Loan</span><strong>{{ money(m.loanProvisionForPeriod) }}</strong></div>
          <div><i></i><span>Maintenance</span><strong>{{ money(m.maintenanceProvision) }}</strong></div>
          <div><i></i><span>Compliance</span><strong>{{ money(m.renewalProvision) }}</strong></div>
        </div>
      </section>

      <div class="pp-footer-space"></div>
    </template>
  </section>
</template>

