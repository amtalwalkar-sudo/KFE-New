<script setup>
import { computed, onMounted, ref } from 'vue'
import { WorkService } from '../application/work/workService.js'

const period = ref('day')
const operatorFilter = ref('All')
const anchorDate = ref(new Date())
const trips = ref([])
const loading = ref(true)
const error = ref('')
const editingTrip = ref(null)
const editForm = ref({ operator: '', tripKm: '', revenue: '' })
const saving = ref(false)
const operators = ['All', ...WorkService.getTripOperators()]

const startOfDay = date => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d }
const endOfDay = date => { const d = startOfDay(date); d.setDate(d.getDate() + 1); return d }
const startOfWeek = date => { const d = startOfDay(date); const day = d.getDay(); const offset = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + offset); return d }
const endOfWeek = date => { const d = startOfWeek(date); d.setDate(d.getDate() + 7); return d }
const startOfMonth = date => { const d = startOfDay(date); d.setDate(1); return d }
const endOfMonth = date => { const d = startOfMonth(date); d.setMonth(d.getMonth() + 1); return d }

const range = computed(() => {
  if (period.value === 'week') return [startOfWeek(anchorDate.value), endOfWeek(anchorDate.value)]
  if (period.value === 'month') return [startOfMonth(anchorDate.value), endOfMonth(anchorDate.value)]
  return [startOfDay(anchorDate.value), endOfDay(anchorDate.value)]
})

const filteredTrips = computed(() => trips.value
  .filter(trip => trip?.status === 'COMPLETED')
  .filter(trip => operatorFilter.value === 'All' || trip.operator === operatorFilter.value)
  .filter(trip => { const time = new Date(trip.tripStartAt).getTime(); return Number.isFinite(time) && time >= range.value[0].getTime() && time < range.value[1].getTime() })
  .sort((a, b) => new Date(a.tripStartAt) - new Date(b.tripStartAt)))

const dayGroups = computed(() => {
  const groups = new Map()
  for (const trip of filteredTrips.value) {
    const key = new Date(trip.tripStartAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(trip)
  }
  return [...groups.entries()].map(([label, items]) => ({ label, trips: items }))
})

const weekGroups = computed(() => {
  const groups = new Map()
  for (const trip of filteredTrips.value) {
    const day = startOfDay(trip.tripStartAt).getTime()
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day).push(trip)
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([day, items]) => ({ date: new Date(day), trips: items }))
})

const monthGroups = computed(() => {
  const groups = []
  const cursor = new Date(range.value[0])
  while (cursor < range.value[1]) {
    const weekStart = startOfWeek(cursor)
    const weekEnd = endOfWeek(cursor)
    const items = filteredTrips.value.filter(trip => { const t = new Date(trip.tripStartAt).getTime(); return t >= weekStart.getTime() && t < weekEnd.getTime() })
    groups.push({ start: new Date(Math.max(weekStart.getTime(), range.value[0].getTime())), end: new Date(Math.min(weekEnd.getTime(), range.value[1].getTime())), trips: items })
    cursor.setDate(cursor.getDate() + 7)
  }
  return groups
})

const totalRevenue = computed(() => filteredTrips.value.reduce((sum, trip) => sum + (Number.isFinite(Number(trip.revenue)) ? Number(trip.revenue) : 0), 0))
const totalKm = computed(() => filteredTrips.value.reduce((sum, trip) => sum + (Number.isFinite(Number(trip.tripKm)) ? Number(trip.tripKm) : 0), 0))

const periodLabel = computed(() => {
  if (period.value === 'month') return range.value[0].toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  if (period.value === 'week') return `${range.value[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(range.value[1].getTime() - 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return anchorDate.value.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
})

const formatTime = value => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
const formatMoney = value => Number.isFinite(Number(value)) ? `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'
const formatKm = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : '—'
const durationLabel = trip => { const ms = new Date(trip.tripEndAt).getTime() - new Date(trip.tripStartAt).getTime(); return Number.isFinite(ms) && ms >= 0 ? `${Math.round(ms / 60000)} min` : '—' }
const routeLabel = trip => `${trip.tripStartLocation?.address || trip.tripStartLocation?.name || 'Pickup'} → ${trip.tripEndLocation?.address || trip.tripEndLocation?.name || 'Drop'}`

const load = async () => {
  loading.value = true
  error.value = ''
  try { trips.value = await WorkService.getAllTrips() } catch (e) { error.value = e?.message || 'Unable to load timeline.' } finally { loading.value = false }
}

const movePeriod = direction => {
  const d = new Date(anchorDate.value)
  if (period.value === 'month') d.setMonth(d.getMonth() + direction)
  else if (period.value === 'week') d.setDate(d.getDate() + (direction * 7))
  else d.setDate(d.getDate() + direction)
  anchorDate.value = d
}

const selectPeriod = value => { period.value = value }
const selectOperator = value => { operatorFilter.value = value }
const openEdit = trip => {
  editingTrip.value = trip
  editForm.value = { operator: trip.operator || '', tripKm: trip.tripKm ?? '', revenue: trip.revenue ?? '' }
}
const closeEdit = () => { if (!saving.value) editingTrip.value = null }
const saveEdit = async () => {
  if (!editingTrip.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await WorkService.updateTrip({ id: editingTrip.value.id, operator: editForm.value.operator, tripKm: editForm.value.tripKm, revenue: editForm.value.revenue })
    if (!result?.ok) throw new Error(result?.reason || 'Trip update failed.')
    await load()
    editingTrip.value = null
  } catch (e) { error.value = e?.message || 'Trip update failed.' } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <section class="timeline-page" aria-labelledby="timeline-title">
    <header class="timeline-header">
      <div>
        <p class="eyebrow">TIMELINE</p>
        <h1 id="timeline-title">{{ periodLabel }}</h1>
      </div>
      <button class="today-btn" type="button" @click="anchorDate = new Date()">Today</button>
    </header>

    <div class="slider" aria-label="Timeline controls">
      <button v-for="item in ['week', 'month']" :key="item" type="button" :class="['slider-item', { active: period === item }]" @click="selectPeriod(item)">{{ item[0].toUpperCase() + item.slice(1) }}</button>
      <button type="button" :class="['slider-item', { active: operatorFilter !== 'All' }]" @click="selectPeriod(period)">Operator</button>
    </div>

    <div v-if="operatorFilter !== 'All'" class="filter-chip">Operator: {{ operatorFilter }} <button type="button" aria-label="Clear operator filter" @click="selectOperator('All')">×</button></div>

    <div class="period-nav">
      <button type="button" aria-label="Previous period" @click="movePeriod(-1)">‹</button>
      <strong>{{ periodLabel }}</strong>
      <button type="button" aria-label="Next period" @click="movePeriod(1)">›</button>
    </div>

    <div v-if="operatorFilter !== 'All' || period !== 'day'" class="operator-strip">
      <button v-for="operator in operators" :key="operator" type="button" :class="['operator-pill', { selected: operatorFilter === operator }]" @click="selectOperator(operator)">{{ operator }}</button>
    </div>

    <div class="summary"><span>{{ filteredTrips.length }} trips</span><span>{{ formatKm(totalKm) }}</span><span>{{ formatMoney(totalRevenue) }}</span></div>

    <p v-if="loading" class="state">Loading timeline…</p>
    <p v-else-if="error" class="state error">{{ error }}</p>
    <p v-else-if="!filteredTrips.length" class="state">No completed trips in this period.</p>

    <div v-else-if="period === 'day'" class="timeline-list">
      <article v-for="trip in filteredTrips" :key="trip.id" class="trip-card">
        <div class="trip-time">{{ formatTime(trip.tripStartAt) }}</div>
        <div class="trip-main"><div class="trip-top"><strong>{{ trip.operator }}</strong><span class="status">✓ Completed</span></div><div class="route">{{ routeLabel(trip) }}</div><div class="meta">{{ formatMoney(trip.revenue) }} · {{ formatKm(trip.tripKm) }} · {{ durationLabel(trip) }}</div></div>
        <button class="edit-btn" type="button" @click="openEdit(trip)" aria-label="Edit trip">✎</button>
      </article>
    </div>

    <div v-else-if="period === 'week'" class="summary-list">
      <button v-for="group in weekGroups" :key="group.date.getTime()" class="group-card" type="button" @click="anchorDate = group.date; period = 'day'">
        <span><strong>{{ group.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) }}</strong><small>{{ group.trips.length }} trips</small></span>
        <span class="group-total">{{ formatMoney(group.trips.reduce((s, t) => s + Number(t.revenue || 0), 0)) }}</span><span>›</span>
      </button>
    </div>

    <div v-else class="summary-list">
      <button v-for="(group, index) in monthGroups" :key="index" class="group-card" type="button" @click="anchorDate = group.start; period = 'week'">
        <span><strong>Week {{ index + 1 }}</strong><small>{{ group.start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }} – {{ new Date(group.end.getTime() - 86400000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }}</small></span>
        <span class="group-total">{{ group.trips.length }} trips · {{ formatMoney(group.trips.reduce((s, t) => s + Number(t.revenue || 0), 0)) }}</span><span>›</span>
      </button>
    </div>

    <div v-if="editingTrip" class="edit-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-title" @click.self="closeEdit">
      <form class="edit-card" @submit.prevent="saveEdit">
        <div class="edit-header"><div><p class="eyebrow">QUICK EDIT</p><h2 id="edit-title">{{ editingTrip.operator }} · {{ formatTime(editingTrip.tripStartAt) }}</h2></div><button type="button" class="close-btn" @click="closeEdit">×</button></div>
        <label>Operator<select v-model="editForm.operator"><option v-for="operator in WorkService.getTripOperators()" :key="operator" :value="operator">{{ operator }}</option></select></label>
        <label>Distance (km)<input v-model="editForm.tripKm" type="number" min="0" step="0.1" inputmode="decimal"></label>
        <label>Fare (₹)<input v-model="editForm.revenue" type="number" min="0" step="1" inputmode="decimal"></label>
        <button class="save-btn" type="submit" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.timeline-page{max-width:760px;margin:0 auto;padding:20px 16px 28px}.timeline-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.eyebrow{margin:0 0 4px;font-size:.62rem;font-weight:900;letter-spacing:.1em;color:var(--kfe-muted-text,#667085)}h1{margin:0;font-size:1.25rem;letter-spacing:-.02em}.today-btn,.period-nav button{border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);color:var(--kfe-ui-text,#101828);border-radius:10px;font-weight:850}.today-btn{padding:9px 12px}.slider{display:flex;gap:5px;padding:5px;background:var(--kfe-ui-surface,#fff);border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:14px;overflow:auto}.slider-item{flex:1;min-width:92px;border:0;background:transparent;border-radius:10px;padding:10px 12px;color:var(--kfe-muted-text,#667085);font:inherit;font-size:.72rem;font-weight:850}.slider-item.active{background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb)}.period-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 0 8px}.period-nav button{width:38px;height:38px;font-size:1.4rem}.period-nav strong{font-size:.82rem;text-align:center}.operator-strip{display:flex;gap:7px;overflow-x:auto;padding:3px 0 9px}.operator-pill{white-space:nowrap;border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:999px;padding:8px 12px;font-size:.68rem;font-weight:800;color:var(--kfe-muted-text,#667085)}.operator-pill.selected{background:var(--kfe-accent-soft,#eff6ff);border-color:var(--kfe-ui-accent,#2563eb);color:var(--kfe-ui-accent,#2563eb)}.filter-chip{display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:6px 9px;border-radius:999px;background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb);font-size:.66rem;font-weight:850}.filter-chip button{border:0;background:transparent;color:inherit;font-size:1rem}.summary{display:flex;gap:8px;margin:6px 0 12px}.summary span{flex:1;padding:9px 8px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:11px;background:var(--kfe-ui-surface,#fff);font-size:.67rem;font-weight:850;text-align:center}.trip-card,.group-card{width:100%;box-sizing:border-box;border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:14px}.trip-card{display:grid;grid-template-columns:52px 1fr 38px;gap:8px;align-items:center;padding:12px;margin-bottom:8px;text-align:left}.trip-time{font-size:.68rem;font-weight:900;color:var(--kfe-muted-text,#667085)}.trip-main{min-width:0}.trip-top{display:flex;gap:8px;align-items:center}.trip-top strong{font-size:.78rem}.status{font-size:.56rem;font-weight:800;color:var(--kfe-success,#079455)}.route{margin-top:3px;font-size:.75rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{margin-top:4px;font-size:.63rem;color:var(--kfe-muted-text,#667085);font-weight:700}.edit-btn{width:34px;height:34px;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:9px;background:transparent;color:var(--kfe-ui-accent,#2563eb);font-size:1rem}.group-card{display:grid;grid-template-columns:1fr auto 20px;align-items:center;gap:8px;padding:13px;margin-bottom:8px;text-align:left;color:var(--kfe-ui-text,#101828)}.group-card span:first-child{display:grid;gap:3px}.group-card strong{font-size:.76rem}.group-card small,.group-total{font-size:.63rem;color:var(--kfe-muted-text,#667085);font-weight:750}.state{text-align:center;padding:42px 16px;color:var(--kfe-muted-text,#667085);font-size:.78rem}.state.error{color:var(--kfe-danger,#d92d20)}.edit-overlay{position:fixed;inset:0;z-index:15000;display:grid;place-items:end center;padding:16px;background:rgba(16,24,40,.42)}.edit-card{width:min(560px,100%);padding:18px;border-radius:18px;background:var(--kfe-ui-surface,#fff);box-shadow:0 18px 50px rgba(16,24,40,.2);display:grid;gap:12px}.edit-header{display:flex;justify-content:space-between;gap:12px}.edit-header h2{margin:0;font-size:1rem}.close-btn{border:0;background:transparent;font-size:1.4rem;color:var(--kfe-muted-text,#667085)}label{display:grid;gap:5px;font-size:.68rem;font-weight:850;color:var(--kfe-muted-text,#667085)}select,input{width:100%;box-sizing:border-box;min-height:44px;padding:10px 11px;border:1px solid var(--kfe-ui-border,#d0d5dd);border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);color:var(--kfe-ui-text,#101828);font:inherit;font-weight:750}.save-btn{min-height:46px;border:0;border-radius:11px;background:var(--kfe-ui-accent,#2563eb);color:#fff;font-weight:900}.save-btn:disabled{opacity:.6}
</style>
