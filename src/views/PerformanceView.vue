<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'
import { getKfeReferenceNow, istDayRange, istMonthRange, istParts } from '../domain/time/ist.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const PERIODS = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'CUSTOM']
const period = ref('MONTH')
const anchor = ref(getKfeReferenceNow())
const customFrom = ref('')
const customTo = ref('')
const layer = ref('overview')
const detailGroup = ref(null)
const loading = ref(true)
const error = ref('')
const snapshot = ref({ shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [], driverCollectedData: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [], compliancePayments: [] })
let unsubscribeChanges = () => {}

const money = value => Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '—'
const money2 = value => Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const num = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const pct = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : '—'
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null
const dayAtNoon = value => { const p = istParts(value); return p ? new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) : new Date(value) }
const weekStart = value => { const day = dayAtNoon(value); return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000) }
const yearRange = value => { const p = istParts(value); if (!p) return istDayRange(value); const from = new Date(Date.UTC(p.year, 0, 1, 12)); const to = new Date(Date.UTC(p.year, 11, 31, 12)); return { from: istDayRange(from).from, to: istDayRange(to).to } }

const range = computed(() => {
  if (period.value === 'CUSTOM' && customFrom.value && customTo.value) {
    return { from: istDayRange(`${customFrom.value}T00:00:00+05:30`).from, to: istDayRange(`${customTo.value}T00:00:00+05:30`).to }
  }
  if (period.value === 'DAY') return istDayRange(anchor.value)
  if (period.value === 'WEEK') { const from = weekStart(anchor.value); const to = new Date(from.getTime() + 6 * 86400000); return { from: istDayRange(from).from, to: istDayRange(to).to } }
  if (period.value === 'YEAR') return yearRange(anchor.value)
  return istMonthRange(anchor.value, anchor.value)
})

const periodLabel = computed(() => {
  const f = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options })
  if (period.value === 'CUSTOM') return customFrom.value && customTo.value ? `${f({day:'numeric',month:'short',year:'numeric'}).format(new Date(`${customFrom.value}T12:00:00Z`))} – ${f({day:'numeric',month:'short',year:'numeric'}).format(new Date(`${customTo.value}T12:00:00Z`))}` : 'Choose dates'
  if (period.value === 'DAY') return f({ weekday:'short', day:'numeric', month:'short', year:'numeric' }).format(anchor.value)
  if (period.value === 'WEEK') { const s=weekStart(anchor.value), e=new Date(s.getTime()+6*86400000); return `${f({day:'numeric',month:'short'}).format(s)} – ${f({day:'numeric',month:'short',year:'numeric'}).format(e)}` }
  if (period.value === 'YEAR') return f({year:'numeric'}).format(anchor.value)
  return f({month:'long',year:'numeric'}).format(anchor.value)
})

const metrics = computed(() => PerformanceService.getMetrics(snapshot.value, range.value))
const m = computed(() => metrics.value || {})
const performanceDiagnostics = computed(() => PerformanceService.getDiagnostics(m.value.value))
const detailDiagnostics = computed(() => detailGroup.value ? (performanceDiagnostics.value[detailGroup.value.key] ? [performanceDiagnostics.value[detailGroup.value.key]] : []) : [])
const authoritativeProfit = computed(() => finite(m.value.operatingProfit))
const targetDaily = computed(() => finite(m.value.driverTarget))
const targetPeriod = computed(() => {
  const x = finite(m.value.driverTargetRemainingObligation)
  if (period.value === 'DAY') return targetDaily.value
  if (x != null) return x
  const days = finite(m.value.driverTargetRemainingEligibleDays)
  return targetDaily.value != null && days ? targetDaily.value * days : null
})
const targetAchieved = computed(() => finite(m.value.revenue))
const targetLeft = computed(() => targetPeriod.value == null || targetAchieved.value == null ? null : Math.max(0, targetPeriod.value - targetAchieved.value))
const breakEven = computed(() => finite(m.value.monthlyBreakEvenRevenue))
const breakEvenLeft = computed(() => breakEven.value == null || targetAchieved.value == null ? null : Math.max(0, breakEven.value - targetAchieved.value))
const targetProgress = computed(() => targetPeriod.value > 0 && targetAchieved.value != null ? Math.min(1, Math.max(0, targetAchieved.value / targetPeriod.value)) : 0)
const breakEvenProgress = computed(() => breakEven.value > 0 && targetAchieved.value != null ? Math.min(1, Math.max(0, targetAchieved.value / breakEven.value)) : 0)

const indicativeGroups = computed(() => [
  { key:'target', title:'Target', rows:[
    ['Target for selected period', money(targetPeriod)],
    ['Revenue achieved', money(targetAchieved.value)],
    ['Target left', money(targetLeft.value)],
    ['Current daily target', money(m.value.driverTarget)],
    ['Remaining eligible days', num(m.value.driverTargetRemainingEligibleDays)],
    ['Opening rolling balance', money(m.value.driverTargetOpeningBalance)],
    ['Target allocated before current day', money(m.value.driverTargetAllocatedBeforeCurrentDay)],
    ['Remaining target obligation', money(m.value.driverTargetRemainingObligation)],
    ['Desired driver profit / take-home', money(m.value.driverTargetDesiredProfitMonthly)],
  ], formula:'Current daily target = remaining target obligation ÷ remaining eligible days.' },
  { key:'breakEven', title:'Break-even', rows:[
    ['Revenue achieved', money(targetAchieved.value)],
    ['Break-even revenue', money(breakEven.value)],
    ['Revenue left to break even', money(breakEvenLeft.value)],
    ['Vehicle KM', num(m.value.vehicleKm)],
    ['Fuel cost / KM', money2(m.value.breakEvenInputs?.fuelCostPerKm)],
    ['Maintenance provision / KM', money2(m.value.breakEvenInputs?.maintenanceProvisionPerKm)],
    ['Fixed costs', money(m.value.breakEvenInputs?.fixedCosts)],
    ['Loan scheduled obligation', money(m.value.loanScheduledObligation)],
    ['Renewal provision', money(m.value.renewalProvision)],
  ], formula:'Variable costs = vehicle KM × fuel cost/KM + vehicle KM × maintenance provision/KM. Break-even = fixed costs + variable costs.' },
])

const authoritativeGroups = computed(() => [
  { key:'revenue', title:'Revenue', rows:[
    ['Authoritative shift-end revenue', money(m.value.revenue)],
    ['Completed rides', num(m.value.counts?.trips)],
    ['Revenue / trip', money(m.value.revenuePerTrip)],
    ['Revenue / KM', money(m.value.revenuePerKm)],
    ['Revenue / hour', money(m.value.revenuePerHour)],
  ], formula:'Revenue = sum of completed shift-end revenue records in the selected period. Trip fare is supporting detail, not the authoritative total.' },
  { key:'cost', title:'Operating cost', rows:[
    ['Operating Cost', money(m.value.actualOperatingCost)],
    ['Fuel', money(m.value.fuelCost)],
    ['Toll', money(m.value.toll)],
    ['Parking', money(m.value.parking)],
    ['Actual maintenance', money(m.value.actualMaintenance)],
    ['Vehicle KM', num(m.value.vehicleKm)],
    ['Cost / vehicle KM', money(m.value.costPerKm)],
  ], formula:'Operating Cost = fuel + toll + parking + actual maintenance.' },
  { key:'profit', title:'Profit / Loss', rows:[
    ['Revenue', money(m.value.revenue)],
    ['Operating Cost', money(m.value.actualOperatingCost)],
    ['Profit / Loss', money(authoritativeProfit.value)],
    ['Previous period Profit / Loss', money(m.value.previous?.operatingProfit)],
  ], formula:'Profit / Loss = Revenue − Operating Cost.' },
])

const provisionGroups = computed(() => [
  { key:'provision', title:'Provision', rows:[
    ['Maintenance provision', money(m.value.maintenanceProvision)],
    ['Renewal provision', money(m.value.renewalProvision)],
    ['Provision required', money(m.value.provisionRequired)],
    ['Actual maintenance', money(m.value.actualMaintenance)],
    ['Maintenance variance', money(finite(m.value.actualMaintenance) != null && finite(m.value.maintenanceProvision) != null ? m.value.actualMaintenance - m.value.maintenanceProvision : null)],
  ], formula:'Maintenance provision = vehicle KM × configured maintenance provision/KM. Renewal provision is derived from the applicable compliance validity/cost records. Provision required = maintenance provision + renewal provision.' },
])

const loanGroups = computed(() => {
  const f = m.value.finance || {}
  const overdue = Array.isArray(f.overdue) ? f.overdue : []
  const schedule = Array.isArray(f.schedule) ? f.schedule : []
  return [{ key:'loan', title:'Loan', rows:[
    ['Outstanding principal', money(f.outstandingPrincipal)],
    ['Original loan amount', money(f.originalPrincipal)],
    ['Scheduled EMI in period', money(m.value.loanScheduledObligation)],
    ['Actual loan payments', money(m.value.actualLoanPaid)],
    ['Prepayments', money(m.value.actualPrepayment)],
    ['Actual financing outflow', money(m.value.actualFinancingOutflow)],
    ['Pending / overdue amount', money(f.totalOverdue)],
    ['Delayed interest', money(f.totalUnpaidOverdueInterest)],
    ['Remaining interest', money(f.remainingInterest)],
  ], formula:'Loan position is supplied by the canonical loan engine. Payment allocation, delayed interest and remaining balance are not recalculated by Performance.' , schedule, overdue }]
})

const currentGroups = computed(() => layer.value === 'indicative' ? indicativeGroups.value : authoritativeGroups.value)
const allFinancialGroups = computed(() => [...provisionGroups.value, ...loanGroups.value])
const calculationTitle = computed(() => detailGroup.value ? `${detailGroup.value.title} — how it is calculated` : '')
const calculationLines = computed(() => {
  if (!detailGroup.value) return []
  const g=detailGroup.value
  if (g.key==='target') return [
    [money(m.value.driverTargetRemainingObligation), '÷', num(m.value.driverTargetRemainingEligibleDays), '=', money(m.value.driverTarget)],
    ['Break-even', '+', 'desired driver profit / take-home', '=', 'monthly target base'],
    ['Monthly target base', '+', money(m.value.driverTargetOpeningBalance), '=', 'effective monthly target'],
  ]
  if (g.key==='breakEven') return [
    [num(m.value.vehicleKm), '×', money2(m.value.breakEvenInputs?.fuelCostPerKm), '=', money(finite(m.value.vehicleKm) != null && finite(m.value.breakEvenInputs?.fuelCostPerKm) != null ? m.value.vehicleKm*m.value.breakEvenInputs.fuelCostPerKm : null)],
    [num(m.value.vehicleKm), '×', money2(m.value.breakEvenInputs?.maintenanceProvisionPerKm), '=', money(finite(m.value.vehicleKm) != null && finite(m.value.breakEvenInputs?.maintenanceProvisionPerKm) != null ? m.value.vehicleKm*m.value.breakEvenInputs.maintenanceProvisionPerKm : null)],
    ['Fixed costs', '+', 'variable fuel cost + variable maintenance cost', '=', money(breakEven.value)],
  ]
  if (g.key==='revenue') return [['Shift-end revenue records', 'Σ', 'selected period', '=', money(m.value.revenue)]]
  if (g.key==='cost') return [['Fuel', '+', 'Toll', '+', 'Parking', '+', 'Actual maintenance', '=', money(m.value.actualOperatingCost)]]
  if (g.key==='profit') return [[money(m.value.revenue), '−', money(m.value.actualOperatingCost), '=', money(authoritativeProfit.value)]]
  if (g.key==='provision') return [
    [num(m.value.vehicleKm), '×', money2(m.value.breakEvenInputs?.maintenanceProvisionPerKm), '=', money(m.value.maintenanceProvision)],
    ['Maintenance provision', '+', 'Renewal provision', '=', money(m.value.provisionRequired)],
  ]
  return []
})

async function refreshSnapshot() {
  try { snapshot.value = await PerformanceService.getSnapshot(); error.value='' }
  catch(e) { error.value=e?.message || 'Performance data could not be loaded.' }
}
function choosePeriod(value) { period.value=value; layer.value='overview'; detailGroup.value=null }
function applyCustom() { if(customFrom.value && customTo.value && customFrom.value<=customTo.value) { period.value='CUSTOM'; layer.value='overview' } }
function movePeriod(amount) {
  const d=dayAtNoon(anchor.value)
  if(period.value==='MONTH') d.setUTCMonth(d.getUTCMonth()+amount)
  else if(period.value==='YEAR') d.setUTCFullYear(d.getUTCFullYear()+amount)
  else if(period.value==='WEEK') d.setUTCDate(d.getUTCDate()+amount*7)
  else d.setUTCDate(d.getUTCDate()+amount)
  anchor.value=d
}
function openLayer(name) { layer.value=name; detailGroup.value=null }
function openCalculation(group) { detailGroup.value=group }
function openDiagnosticFix(item) {
  if (!item?.target) return
  try {
    if (item.target.adminSection) localStorage.setItem('kfe-admin-navigation-v1', JSON.stringify({ adminSection:item.target.adminSection, selected:item.target.selected, settingsSelected:'backup' }))
  } catch (_e) {}
  void router.push(item.target.route)
}
function closeDetail() { detailGroup.value=null }
function closeLayer() { layer.value='overview'; detailGroup.value=null }
function isProfit() { return authoritativeProfit.value != null && authoritativeProfit.value >= 0 }
onMounted(async()=>{ try { await refreshSnapshot() } finally { loading.value=false }; unsubscribeChanges=PerformanceService.subscribeDataChanges(()=>void refreshSnapshot()) })
onBeforeUnmount(()=>unsubscribeChanges())
</script>

<template>
  <section class="performance-page">
    <div v-if="loading" class="performance-state"><span class="spinner"></span><span>Loading performance…</span></div>
    <div v-else-if="error" class="performance-state performance-error"><strong>Performance unavailable</strong><span>{{ error }}</span></div>

    <template v-else-if="layer==='overview'">
      <header class="performance-compact-head">
        <div><small>PERFORMANCE</small><h1>Business position</h1></div>
        <button class="today-button" @click="anchor=getKfeReferenceNow();period='MONTH'">Current month</button>
      </header>

      <section class="period-bar" aria-label="Performance period">
        <div class="period-segment">
          <button v-for="item in PERIODS" :key="item" :class="{active:period===item}" @click="choosePeriod(item)">{{ item }}</button>
        </div>
        <div v-if="period!=='CUSTOM'" class="period-nav"><button @click="movePeriod(-1)" aria-label="Previous period">‹</button><strong>{{ periodLabel }}</strong><button @click="movePeriod(1)" aria-label="Next period">›</button></div>
        <div v-else class="custom-dates"><label>From<input v-model="customFrom" type="date"></label><label>To<input v-model="customTo" type="date"></label><button :disabled="!customFrom||!customTo||customFrom>customTo" @click="applyCustom">Apply</button></div>
      </section>

      <section class="hero-result">
        <small>ACTUAL BUSINESS RESULT</small>
        <strong>{{ money(authoritativeProfit) }}</strong>
        <b :class="isProfit()?'profit':'loss'">{{ isProfit() ? 'PROFIT' : 'LOSS' }}</b>
        <div class="result-track"><span :style="{width: authoritativeProfit!=null ? Math.min(100,Math.max(0, Math.abs(authoritativeProfit)/(Math.abs(m.revenue)||1)*100))+'%' : '0%'}"></span></div>
        <p>Revenue {{ money(m.revenue) }} · Operating Cost {{ money(m.actualOperatingCost) }}</p>
      </section>

      <section class="position-card indicative-card">
        <button class="position-head" @click="openLayer('indicative')"><span><small>INDICATIVE</small><b>Where are we headed?</b></span><i>›</i></button>
        <div class="position-items">
          <div><span>Target</span><strong>{{ money(targetPeriod) }}</strong></div>
          <div class="progress-item"><span>Target progress</span><div class="track"><span :style="{width:(targetProgress*100)+'%'}"></span></div><small>{{ money(targetAchieved) }} achieved · {{ money(targetLeft) }} left</small></div>
          <div><span>Revenue left to break even</span><strong>{{ money(breakEvenLeft) }}</strong></div>
        </div>
      </section>

      <section class="position-card authoritative-card">
        <button class="position-head" @click="openLayer('authoritative')"><span><small>AUTHORITATIVE</small><b>What actually happened?</b></span><i>›</i></button>
        <div class="position-summary"><div><span>Revenue</span><strong>{{ money(m.revenue) }}</strong></div><div><span>Operating Cost</span><strong>{{ money(m.actualOperatingCost) }}</strong></div><div><span>Profit / Loss</span><strong :class="isProfit()?'profit':'loss'">{{ money(authoritativeProfit) }}</strong></div></div>
      </section>

      <section class="business-position">
        <div class="section-label"><small>BUSINESS POSITION</small><span>Actual · Break-even · Target</span></div>
        <div class="position-track">
          <span class="marker actual" :style="{left:(Math.min(100,Math.max(0,targetProgress*100)))+'%'}"><i></i><b>Actual</b></span>
          <span class="marker break-even" :style="{left:(breakEven&&targetPeriod ? Math.min(100,Math.max(0,breakEven/targetPeriod*100)) : 50)+'%'}"><i></i><b>Break-even</b></span>
          <span class="marker target" style="left:100%"><i></i><b>Target</b></span>
        </div>
      </section>

      <section class="position-card finance-position">
        <div class="section-label"><small>FINANCIAL POSITION</small><span>Available when you need the detail</span></div>
        <div class="finance-links"><button v-for="group in allFinancialGroups" :key="group.key" @click="openCalculation(group)"><span>{{ group.title }}</span><i>›</i></button></div>
      </section>
    </template>

    <template v-else>
      <header class="layer-head"><button class="layer-back" @click="detailGroup ? closeDetail() : closeLayer()" aria-label="Back">‹</button><div><small>PERFORMANCE · {{ layer==='indicative'?'INDICATIVE':'AUTHORITATIVE' }}</small><h1>{{ detailGroup ? calculationTitle : (layer==='indicative' ? 'Indicative position' : 'Authoritative result') }}</h1><span>{{ periodLabel }}</span></div></header>

      <template v-if="!detailGroup">
        <section class="layer-intro"><p v-if="layer==='indicative'">All metrics contributing to Target and Break-even for this period.</p><p v-else>All authoritative metrics contributing to Revenue, Operating Cost and Profit / Loss for this period.</p></section>
        <section v-for="group in currentGroups" :key="group.key" class="metric-group">
          <button class="group-head" @click="openCalculation(group)"><span><small>{{ layer==='indicative'?'INDICATIVE':'AUTHORITATIVE' }}</small><h2>{{ group.title }}</h2></span><i>›</i></button>
          <div class="metric-list"><div v-for="row in group.rows" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div>
        </section>
        <section v-if="layer==='authoritative'" class="metric-group"><div class="group-head static"><span><small>FINANCIAL POSITION</small><h2>Provision & Loan</h2></span></div><div class="metric-list"><button v-for="group in allFinancialGroups" :key="group.key" @click="openCalculation(group)"><span>{{ group.title }}</span><strong>View details ›</strong></button></div></section>
      </template>

      <template v-else>
        <section class="calculation-explainer">
          <div class="calculation-intro"><small>EXACT CALCULATION</small><p>{{ detailGroup.formula }}</p></div>
          <div class="equation-list"><div v-for="(line,index) in calculationLines" :key="index" class="equation"><span v-for="(part,i) in line" :key="i" :class="{operator:['+','−','÷','×','=','Σ'].includes(part)}">{{ part }}</span></div></div>
          <section class="metric-group nested"><div class="group-head static"><span><small>SUPPORTING METRICS</small><h2>{{ detailGroup.title }}</h2></span></div><div class="metric-list"><div v-for="row in detailGroup.rows" :key="row[0]"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div></div></section>
          <template v-if="detailGroup.key==='loan'">
            <section v-if="detailGroup.schedule?.length" class="metric-group nested"><div class="group-head static"><span><small>EMI-WISE</small><h2>Scheduled / overdue detail</h2></span></div><div class="loan-list"><div v-for="row in detailGroup.schedule" :key="row.dueDate"><span>{{ row.dueDate }}</span><strong>{{ money2(row.originalEmiAmount) }}</strong><small>Delayed interest {{ money2(row.unpaidOverdueInterest) }}</small></div></div></section>
          </template>
          <section v-if="detailDiagnostics.length" class="diagnostic-layer">
            <div class="diagnostic-head"><div><small>EXPLAIN &amp; FIX</small><h2>Why this calculation is unavailable</h2></div><span>Root cause</span></div>
            <article v-for="item in detailDiagnostics" :key="item.id" class="diagnostic-card">
              <div class="diagnostic-status"><span>⚠</span><strong>{{ item.rootCause }}</strong><b>{{ item.status === 'BLOCKED' ? 'Blocked upstream' : item.status === 'NOT_APPLICABLE' ? 'Not applicable' : 'Needs attention' }}</b></div>
              <div class="diagnostic-grid"><div><small>WHY</small><p>{{ item.why }}</p></div><div><small>FIX</small><p>{{ item.fix }}</p></div></div>
              <div class="diagnostic-chain"><small>DEPENDENCY PATH</small><div><span v-for="(step,index) in item.chain" :key="step"><b>{{ step }}</b><i v-if="index<item.chain.length-1">→</i></span></div></div>
              <button v-if="item.target" class="diagnostic-fix" type="button" @click="openDiagnosticFix(item)">Fix this <span>→</span></button>
            </article>
          </section>
        </section>
      </template>
    </template>

    <div class="performance-nav-handle" aria-label="Show navigation" role="button" tabindex="0" @click="window.dispatchEvent(new CustomEvent('kfe:performance-nav'))"><span>⌃</span></div>
  </section>
</template>

<style scoped>
.performance-page{min-height:calc(100dvh - 12px);padding:12px 14px 52px;display:grid;gap:14px;color:var(--kfe-ui-text);background:var(--kfe-ui-bg)}
.performance-compact-head,.layer-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.performance-compact-head h1,.layer-head h1{margin:.12rem 0 0;font-size:clamp(1.45rem,5vw,2rem);letter-spacing:-.04em}.performance-compact-head small,.layer-head small,.section-label small,.position-head small,.group-head small,.hero-result small,.calculation-intro small{font-size:.64rem;font-weight:900;letter-spacing:.12em;color:var(--kfe-muted-text)}
.today-button,.period-segment button,.period-nav button,.custom-dates button{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);color:var(--kfe-ui-text);border-radius:12px;min-height:42px;padding:0 12px;font-weight:850}.today-button{font-size:.7rem}.period-bar{display:grid;gap:9px}.period-segment{display:flex;gap:5px;overflow:auto;scrollbar-width:none}.period-segment button{white-space:nowrap;font-size:.7rem}.period-segment button.active{background:var(--kfe-accent);border-color:var(--kfe-accent);color:var(--kfe-ui-on-accent,#fff)}.period-nav{display:grid;grid-template-columns:46px 1fr 46px;align-items:center;gap:6px}.period-nav strong{text-align:center;font-size:.82rem}.custom-dates{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;align-items:end}.custom-dates label{display:grid;gap:4px;font-size:.62rem;font-weight:800;color:var(--kfe-muted-text)}.custom-dates input{min-height:42px;border:1px solid var(--kfe-ui-border);border-radius:11px;background:var(--kfe-ui-surface);color:var(--kfe-ui-text);padding:0 8px}.hero-result,.position-card,.business-position,.metric-group,.calculation-explainer{border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);border-radius:22px}.hero-result{padding:20px;display:grid;gap:5px}.hero-result strong{font-size:clamp(2.7rem,13vw,5rem);line-height:.95;letter-spacing:-.07em;font-weight:950;font-variant-numeric:tabular-nums}.hero-result b{font-size:.72rem;letter-spacing:.14em}.profit{color:var(--kfe-success)}.loss{color:var(--kfe-danger)}.result-track,.track{height:9px;border-radius:999px;background:color-mix(in srgb,var(--kfe-ui-text) 10%,var(--kfe-ui-surface));overflow:hidden}.result-track span,.track span{display:block;height:100%;border-radius:inherit;background:var(--kfe-accent);transform-origin:left;animation:performance-fill .55s ease both}.hero-result p{margin:.4rem 0 0;color:var(--kfe-muted-text);font-size:.72rem}.position-card{padding:0;overflow:hidden}.position-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;background:transparent;color:inherit;padding:16px;border:0}.position-head b{display:block;margin-top:3px;font-size:1rem}.position-head i,.group-head i{font-size:1.4rem;font-style:normal;color:var(--kfe-muted-text)}.position-items{display:grid;gap:13px;padding:0 16px 17px}.position-items>div{display:grid;gap:5px}.position-items span,.position-summary span,.section-label span,.finance-links span,.metric-list span{font-size:.72rem;color:var(--kfe-muted-text)}.position-items strong{font-size:1.25rem;font-weight:950}.position-items small{font-size:.68rem;color:var(--kfe-muted-text)}.progress-item .track{margin-top:2px}.authoritative-card .position-head{border-bottom:1px solid var(--kfe-ui-border)}.position-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.position-summary>div{padding:14px 12px;display:grid;gap:4px;border-right:1px solid var(--kfe-ui-border)}.position-summary>div:last-child{border-right:0}.position-summary strong{font-size:.95rem;font-weight:950}.business-position{padding:16px}.section-label{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.section-label span{font-size:.65rem}.position-track{position:relative;height:82px;margin-top:12px;border-top:4px solid var(--kfe-ui-border)}.marker{position:absolute;top:-11px;transform:translateX(-50%);display:grid;justify-items:center;gap:5px}.marker i{width:18px;height:18px;border-radius:50%;background:var(--kfe-ui-surface);border:4px solid var(--kfe-accent);box-shadow:0 0 0 4px var(--kfe-accent-soft)}.marker.break-even i{border-color:var(--kfe-warning)}.marker.target i{border-color:var(--kfe-success)}.marker b{font-size:.62rem;white-space:nowrap}.finance-position{padding:16px}.finance-links{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.finance-links button{min-height:52px;border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-bg);color:var(--kfe-ui-text);border-radius:13px;display:flex;justify-content:space-between;align-items:center;padding:0 12px;font-weight:850}.layer-head{padding:2px 0}.layer-back{width:44px!important;min-width:44px!important;height:44px!important;border-radius:13px;background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border);color:inherit;font-size:1.6rem}.layer-head>div{flex:1}.layer-head span{display:block;margin-top:3px;font-size:.68rem;color:var(--kfe-muted-text)}.layer-intro{padding:0 3px;color:var(--kfe-muted-text);font-size:.78rem}.metric-group{overflow:hidden}.group-head{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;background:transparent;color:inherit;padding:15px 16px;border:0}.group-head h2{margin:3px 0 0;font-size:1.05rem}.group-head.static{cursor:default}.metric-list{border-top:1px solid var(--kfe-ui-border);padding:0 16px}.metric-list>div,.metric-list>button{width:100%;min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:0;border-bottom:1px solid var(--kfe-ui-border);background:transparent;color:inherit;text-align:left;padding:9px 0}.metric-list>div:last-child,.metric-list>button:last-child{border-bottom:0}.metric-list strong{font-size:.82rem;font-weight:900;text-align:right;font-variant-numeric:tabular-nums}.calculation-explainer{padding:16px;display:grid;gap:13px}.calculation-intro{display:grid;gap:5px}.calculation-intro p{margin:0;font-size:.8rem;line-height:1.5}.equation-list{display:grid;gap:8px}.equation{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:12px;border-radius:14px;background:var(--kfe-ui-bg);border:1px solid var(--kfe-ui-border);font-size:.78rem;font-weight:800}.equation span{font-variant-numeric:tabular-nums}.equation .operator{font-size:1rem;color:var(--kfe-accent)}.nested{background:var(--kfe-ui-bg)}.diagnostic-layer{display:grid;gap:10px;padding:15px;border:1px solid var(--kfe-ui-border);background:var(--kfe-ui-surface);border-radius:22px}.diagnostic-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.diagnostic-head small{font-size:.64rem;font-weight:900;letter-spacing:.12em;color:var(--kfe-muted-text)}.diagnostic-head h2{margin:3px 0 0;font-size:1.05rem}.diagnostic-head>span{font-size:.65rem;font-weight:900;color:var(--kfe-warning)}.diagnostic-card{display:grid;gap:11px;padding:13px;border:1px solid var(--kfe-ui-border);border-radius:16px;background:var(--kfe-ui-bg)}.diagnostic-status{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.diagnostic-status>span{font-size:.8rem}.diagnostic-status strong{font-size:.85rem}.diagnostic-status b{margin-left:auto;font-size:.62rem;color:var(--kfe-warning);letter-spacing:.04em}.diagnostic-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.diagnostic-grid>div{display:grid;gap:4px}.diagnostic-grid small,.diagnostic-chain>small{font-size:.6rem;font-weight:900;letter-spacing:.1em;color:var(--kfe-muted-text)}.diagnostic-grid p{margin:0;font-size:.74rem;line-height:1.45}.diagnostic-chain{display:grid;gap:6px}.diagnostic-chain>div{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.diagnostic-chain b{font-size:.67rem}.diagnostic-chain i{font-style:normal;color:var(--kfe-muted-text)}.diagnostic-fix{min-height:42px;border:1px solid var(--kfe-accent);border-radius:12px;background:var(--kfe-accent);color:var(--kfe-ui-on-accent,#fff);font-weight:900;padding:0 13px;justify-self:start}.loan-list{display:grid;border-top:1px solid var(--kfe-ui-border)}.loan-list>div{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:11px 16px;border-bottom:1px solid var(--kfe-ui-border)}.loan-list strong{text-align:right}.loan-list small{grid-column:1/-1;color:var(--kfe-muted-text)}.performance-nav-handle{position:fixed;left:50%;bottom:max(7px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1000;width:76px;height:26px;display:grid;place-items:center;touch-action:none}.performance-nav-handle::before{content:"";position:absolute;width:58px;height:5px;border-radius:999px;background:color-mix(in srgb,var(--kfe-ui-text) 32%,transparent);opacity:.65}.performance-nav-handle span{position:relative;z-index:1;font-size:.72rem;color:color-mix(in srgb,var(--kfe-ui-text) 70%,transparent);line-height:1}.performance-nav-handle:focus-visible{outline:2px solid var(--kfe-accent);outline-offset:3px}@keyframes performance-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@media(min-width:700px){.performance-page{width:min(100%,980px);margin:0 auto;padding-inline:22px}.finance-links{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.diagnostic-grid{grid-template-columns:1fr}.position-summary{grid-template-columns:1fr}.position-summary>div{border-right:0;border-bottom:1px solid var(--kfe-ui-border)}.position-summary>div:last-child{border-bottom:0}.custom-dates{grid-template-columns:1fr 1fr}.custom-dates button{grid-column:1/-1}.finance-links{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.result-track span,.track span{animation:none}}
</style>
