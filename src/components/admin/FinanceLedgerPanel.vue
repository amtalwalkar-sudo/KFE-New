<script setup>
import { computed, ref } from 'vue'
import { getKfeReferenceNow, istDateKey, istParts, reportingRangeFor } from '../../domain/time/ist.js'

const props = defineProps({
  snapshot: { type: Object, default: () => ({}) },
})

const mode = ref('MONTH')
const anchor = ref(istDateKey(getKfeReferenceNow()))
const category = ref('ALL')

const live = xs => (xs || []).filter(x => !x?.deletedAt && x?.deleted !== true)
const anchorDate = computed(() => {
  const key = anchor.value || istDateKey(getKfeReferenceNow())
  const [y,m,d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 6, 30, 0))
})
const range = computed(() => reportingRangeFor(mode.value, anchorDate.value))
const rangeKeys = computed(() => {
  const r = range.value
  return r ? { from: istDateKey(r.from), to: istDateKey(r.to) } : { from: null, to: null }
})
const inRange = value => {
  const key = istDateKey(value)
  return !!key && (!rangeKeys.value.from || key >= rangeKeys.value.from) && (!rangeKeys.value.to || key <= rangeKeys.value.to)
}
const money = value => Number.isFinite(Number(value)) ? '₹' + Number(value).toLocaleString('en-IN',{maximumFractionDigits:2}) : '—'

const rows = computed(() => {
  const s = props.snapshot || {}
  const out = []
  for (const shift of live(s.shifts)) {
    const date = shift.shiftEndAt || shift.shiftStartAt || shift.createdAt
    if (!inRange(date)) continue
    const dateKey = istDateKey(date)
    const toll = Number(shift.toll) || 0
    const parking = Number(shift.parking) || 0
    const treatment = String(shift.tollParkingRevenueTreatment || 'INCLUDED').toUpperCase()
    if (toll !== 0) out.push({ id:`toll:${shift.id}`, category:'Toll', date:dateKey, amount:toll, description:'Shift toll', detail:treatment === 'INCLUDED' ? 'Included' : 'Excluded', source:'Shift' })
    if (parking !== 0) out.push({ id:`parking:${shift.id}`, category:'Parking', date:dateKey, amount:parking, description:'Shift parking', detail:treatment === 'INCLUDED' ? 'Included' : 'Excluded', source:'Shift' })
  }
  for (const fuel of live(s.fuelLogs)) {
    const date = fuel.capturedAt || fuel.createdAt
    if (!inRange(date)) continue
    const amount = Number(fuel.amount) || 0
    if (amount === 0) continue
    out.push({ id:`fuel:${fuel.id}`, category:'Fuel', date:istDateKey(date), amount, description:'Fuel', detail:Number.isFinite(Number(fuel.quantityKg)) ? `${Number(fuel.quantityKg).toFixed(2)} kg` : '—', source:'Fuel log' })
  }
  return out.filter(row => category.value === 'ALL' || row.category === category.value).sort((a,b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
})

const totals = computed(() => {
  const result = { Toll:0, Parking:0, Fuel:0 }
  for (const row of rows.value) result[row.category] += row.amount
  return result
})
const total = computed(() => Object.values(totals.value).reduce((sum,v)=>sum+v,0))
const label = computed(() => {
  const r = range.value
  if (!r) return anchor.value
  if (mode.value === 'DAY') return rangeKeys.value.from
  if (mode.value === 'MONTH') {
    const p = istParts(r.from)
    return p ? `${String(p.month).padStart(2,'0')}/${p.year}` : anchor.value
  }
  return `${rangeKeys.value.from} → ${rangeKeys.value.to}`
})
function shiftAnchor(direction) {
  const d = new Date(anchorDate.value)
  if (mode.value === 'DAY') d.setUTCDate(d.getUTCDate() + direction)
  else if (mode.value === 'WEEK') d.setUTCDate(d.getUTCDate() + (7 * direction))
  else d.setUTCMonth(d.getUTCMonth() + direction)
  const p = { year:d.getUTCFullYear(), month:d.getUTCMonth()+1, day:d.getUTCDate() }
  anchor.value = `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`
}
function setToday(){ anchor.value = istDateKey(getKfeReferenceNow()) }
</script>

<template>
<section class="ledger-panel">
  <div class="ledger-toolbar">
    <div class="ledger-periods">
      <button v-for="item in ['DAY','WEEK','MONTH']" :key="item" class="ledger-period" :class="{active:mode===item}" @click="mode=item">{{item[0]+item.slice(1).toLowerCase()}}</button>
    </div>
    <button class="secondary ledger-today" @click="setToday">Today</button>
  </div>
  <div class="ledger-navigation">
    <button class="secondary" aria-label="Previous period" @click="shiftAnchor(-1)">‹</button>
    <strong>{{label}}</strong>
    <button class="secondary" aria-label="Next period" @click="shiftAnchor(1)">›</button>
  </div>
  <div class="ledger-categories">
    <button v-for="item in [{key:'ALL',label:'All'},{key:'Toll',label:'Toll'},{key:'Parking',label:'Parking'},{key:'Fuel',label:'Fuel'}]" :key="item.key" :class="{active:category===item.key}" @click="category=item.key">{{item.label}}</button>
  </div>
  <section class="ledger-summary">
    <div><span>Toll</span><strong>{{money(totals.Toll)}}</strong></div>
    <div><span>Parking</span><strong>{{money(totals.Parking)}}</strong></div>
    <div><span>Fuel</span><strong>{{money(totals.Fuel)}}</strong></div>
    <div><span>Total</span><strong>{{money(total)}}</strong></div>
  </section>
  <section class="ledger-list">
    <div class="ledger-row ledger-header"><span>Date</span><span>Ledger</span><span>Details</span><strong>Amount</strong></div>
    <article v-for="row in rows" :key="row.id" class="ledger-row">
      <span>{{row.date}}</span>
      <span><strong>{{row.category}}</strong><small>{{row.description}}</small></span>
      <span><small>{{row.detail}}</small><small>{{row.source}}</small></span>
      <strong>{{money(row.amount)}}</strong>
    </article>
    <div v-if="!rows.length" class="empty">No ledger entries for this period.</div>
  </section>
  <p class="ledger-note">Read-only history. Toll and Parking dates come from the authoritative shift date. Fuel date comes from the authoritative recorded timestamp.</p>
</section>
</template>
