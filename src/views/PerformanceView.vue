<script setup>
import { computed, onMounted, ref } from 'vue'
import { PerformanceService } from '../application/performance/performanceService.js'

const PERIODS = ['DAY','WEEK','MONTH','3 MONTHS','6 MONTHS','1 YEAR','MULTI-YEAR','TILL DATE','CUSTOM RANGE']
const LAYERS = { target:['Position','Pace & projection','Target drivers','Comparison','Detailed period'], revenue:['Revenue position','Revenue composition','Revenue efficiency','Time & trend','Detailed revenue'], cost:['Break-even position','Cost drivers','Cost movement','Break-even analysis','Detailed costs'], profit:['Operating profit','Provision-adjusted profit','Financing & cash','Provision buckets','Profit trend','Detailed financial records'] }
const period = ref('MONTH')
const navigatorOpen = ref(false)
const activeCard = ref(null)
const activeLayer = ref(0)
const customFrom = ref('')
const customTo = ref('')
const loading = ref(true)
const error = ref('')
const snapshot = ref({ shifts: [], trips: [], fuelLogs: [], vehicles: [], drivers: [], compliance: [], maintenance: [], driverCollectedData: [], loans: [], loanPayments: [], prepayments: [], driverTargets: [], breakEvenInputs: [] })

const money = value => Number.isFinite(value) ? `₹${Math.round(value).toLocaleString('en-IN')}` : '—'
const num = value => Number.isFinite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '—'
const pct = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

const range = computed(() => {
  const now = new Date()
  let from = new Date(now)
  const to = new Date(now)
  if (period.value === 'CUSTOM RANGE' && customFrom.value && customTo.value) return { from: new Date(`${customFrom.value}T00:00:00`), to: new Date(`${customTo.value}T23:59:59.999`) }
  if (period.value === 'DAY') from.setHours(0, 0, 0, 0)
  else if (period.value === 'WEEK') { from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - ((from.getDay() + 6) % 7)) }
  else if (period.value === 'MONTH') from = new Date(now.getFullYear(), now.getMonth(), 1)
  else if (period.value === '3 MONTHS') from.setMonth(from.getMonth() - 3)
  else if (period.value === '6 MONTHS') from.setMonth(from.getMonth() - 6)
  else if (period.value === '1 YEAR') from.setFullYear(from.getFullYear() - 1)
  else if (period.value === 'MULTI-YEAR') from.setFullYear(now.getFullYear() - 5)
  else if (period.value === 'TILL DATE') from = new Date(0)
  return { from, to }
})

const metrics = computed(() => PerformanceService.getMetrics(snapshot.value, range.value))
const activeRows = computed(() => activeCard.value ? PerformanceService.getLayerRows(activeCard.value, activeLayer.value, metrics.value) : [])
const cards = computed(() => ({
  target: { title: '🎯 Target & Position', rows: [['Achieved revenue', money(metrics.value.revenue)], ['Target', metrics.value.target == null ? 'Not configured' : money(metrics.value.target)], ['Achievement', metrics.value.target == null ? '—' : pct(metrics.value.revenue / metrics.value.target * 100)]] },
  revenue: { title: '💰 Revenue', rows: [['Total revenue', money(metrics.value.revenue)], ['Revenue / KM', money(metrics.value.revenuePerKm)], ['Revenue / trip', money(metrics.value.revenuePerTrip)]] },
  cost: { title: '🧾 Cost & Break-even', rows: [['Operating cost', money(metrics.value.runningCost)], ['Break-even', money(metrics.value.breakEvenRevenue)], ['Cost / KM', money(metrics.value.costPerKm)]] },
  profit: { title: '🏦 Profit & Cash', rows: [['Operating profit', money(metrics.value.operatingProfit)], ['Provision-adjusted', money(metrics.value.provisionAdjustedProfit)], ['Cash after financing', money(metrics.value.cashSurplusAfterFinancing)]] }
}))
const layerTitle = computed(() => activeCard.value ? `${cards.value[activeCard.value].title.replace(/^\S+\s/, '')} — ${LAYERS[activeCard.value][activeLayer.value]}` : '')
const completeness = computed(() => metrics.value.completeness)
function choosePeriod(value) { period.value = value; if (value !== 'CUSTOM RANGE') navigatorOpen.value = false }
function applyCustom() { if (customFrom.value && customTo.value) { period.value = 'CUSTOM RANGE'; navigatorOpen.value = false } }
function openCard(key) { activeCard.value = key; activeLayer.value = 0 }
function back() { if (activeLayer.value) activeLayer.value -= 1; else activeCard.value = null }
function next() { if (activeCard.value && activeLayer.value < LAYERS[activeCard.value].length - 1) activeLayer.value += 1 }
onMounted(async () => {
  try { snapshot.value = await PerformanceService.getSnapshot() }
  catch (e) { error.value = e?.message || 'Performance data could not be loaded.' }
  finally { loading.value = false }
})
</script>

<template>
  <section class="performance-page">
    <div v-if="loading" class="state">Loading Performance…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <template v-else-if="!activeCard">
      <header class="head"><div><small>PERFORMANCE</small><h1>Business position</h1></div><button class="period" @click="navigatorOpen = true">{{ period }}⌄</button></header>
      <div class="grid">
        <button v-for="key in ['target','revenue','cost','profit']" :key="key" class="box" @click="openCard(key)">
          <h2>{{ cards[key].title }}</h2>
          <div v-for="row in cards[key].rows" :key="row[0]" class="row"><span>{{ row[0] }}</span><strong>{{ row[1] }}</strong></div>
          <em>View detail →</em>
        </button>
      </div>
      <section class="pulse"><small>OPERATIONAL PULSE</small><h2>What matters now</h2><div class="pulse-grid"><div><span>Vehicle KM</span><b>{{ num(metrics.vehicleKm) }}</b></div><div><span>Business KM</span><b>{{ num(metrics.businessKm) }}</b></div><div><span>Trips</span><b>{{ num(metrics.counts.trips) }}</b></div><div><span>Fuel cost</span><b>{{ money(metrics.fuelCost) }}</b></div></div></section>
    </template>
    <template v-else>
      <header class="head"><button class="back" @click="back">‹</button><div><small>PERFORMANCE</small><h1>{{ layerTitle }}</h1></div><button v-if="activeLayer < LAYERS[activeCard].length - 1" class="next" @click="next">Next ›</button></header>
      <section class="detail"><div class="tabs"><button v-for="(layer, index) in LAYERS[activeCard]" :key="layer" :class="{ active: index === activeLayer }" @click="activeLayer = index">{{ index + 1 }}. {{ layer }}</button></div><h2>{{ LAYERS[activeCard][activeLayer] }}</h2><p>Period: <b>{{ period }}</b></p><div class="detail-grid"><div v-for="(row, index) in activeRows" :key="index"><span>{{ row[0] }}</span><b>{{ row.slice(1).join(' · ') }}</b></div></div><div class="status-grid"><span>Target {{ completeness.target ? 'configured' : 'not configured' }}</span><span>Loan {{ completeness.loan ? 'configured' : 'not configured' }}</span><span>Hourly {{ completeness.hourlyData ? 'available' : 'unavailable' }}</span><span>Break-even {{ completeness.breakEven ? 'calculated' : 'unavailable' }}</span></div><div class="note">Read-only interpretation of authoritative KFE records. Operating profit uses actual operating costs; provisions and financing cash are shown separately. Missing authoritative inputs remain visibly unavailable; Performance never invents substitute values.</div></section>
    </template>
    <div v-if="navigatorOpen" class="overlay"><section class="navigator"><header><div><small>PERIOD</small><h2>Choose reporting range</h2></div><button @click="navigatorOpen = false">✕</button></header><div class="periods"><button v-for="item in PERIODS" :key="item" :class="{ selected: period === item }" @click="choosePeriod(item)">{{ item }}<span>›</span></button></div><div v-if="period === 'CUSTOM RANGE'" class="custom"><label>From<input v-model="customFrom" type="date"></label><label>To<input v-model="customTo" type="date"></label><button @click="applyCustom">Apply range</button></div></section></div>
  </section>
</template>

<style scoped>
.performance-page{min-height:100%;padding:16px;box-sizing:border-box;color:#0f172a;max-width:760px;margin:auto}.head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:16px}.head small,.pulse small{font-size:.68rem;font-weight:800;color:#64748b;letter-spacing:.08em}.head h1{font-size:1.22rem;margin:3px 0 0}.period,.back,.next,.navigator header button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:9px 11px;font-weight:800}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box,.pulse,.detail{background:#fff;border:1px solid #e2e8f0;border-radius:16px}.box{min-height:190px;padding:15px;text-align:left;box-shadow:0 3px 12px rgba(15,23,42,.04)}.box h2{font-size:.96rem;margin:0 0 14px}.row{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid #f1f5f9;font-size:.75rem}.row strong{text-align:right;font-size:.78rem}.box em{display:block;margin-top:12px;color:#2563eb;font-style:normal;font-size:.74rem;font-weight:800}.pulse{margin-top:12px;padding:15px}.pulse h2{font-size:1rem;margin:3px 0 10px}.pulse-grid,.detail-grid,.status-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pulse-grid div,.detail-grid div,.status-grid span{background:#f8fafc;border-radius:10px;padding:10px}.pulse-grid span,.detail-grid span{display:block;color:#64748b;font-size:.7rem}.pulse-grid b,.detail-grid b{display:block;margin-top:3px}.state{padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;text-align:center}.error{color:#b91c1c}.back{font-size:1.3rem;padding:4px 11px}.next{color:#2563eb}.detail{padding:14px}.tabs{display:flex;gap:7px;overflow-x:auto;padding-bottom:10px}.tabs button{white-space:nowrap;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:.7rem;font-weight:800}.tabs button.active{background:#0f172a;color:#fff}.detail h2{font-size:1.08rem;margin:10px 0 4px}.detail p{color:#64748b;font-size:.78rem}.detail-grid{margin-top:12px}.status-grid{margin-top:12px}.status-grid span{font-size:.7rem;font-weight:800}.note{margin-top:14px;padding:12px;border-radius:10px;background:#f8fafc;color:#475569;font-size:.75rem;line-height:1.45}.overlay{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:10000;display:flex;align-items:flex-end}.navigator{width:100%;max-height:88vh;overflow:auto;background:#fff;border-radius:20px 20px 0 0;padding:18px;box-sizing:border-box}.navigator header{display:flex;justify-content:space-between;align-items:flex-start}.navigator h2{font-size:1.1rem;margin:3px 0 14px}.periods{display:grid;gap:7px}.periods button{display:flex;justify-content:space-between;border:1px solid #e2e8f0;background:#f8fafc;border-radius:11px;padding:12px;font-weight:800}.periods button.selected{border-color:#2563eb;background:#eff6ff;color:#1d4ed8}.custom{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.custom label{font-size:.72rem;font-weight:800}.custom input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #cbd5e1;border-radius:9px}.custom button{grid-column:1/-1;padding:11px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:800}@media(max-width:430px){.grid{gap:8px}.box{padding:12px;min-height:185px}.performance-page{padding:12px}}
</style>
