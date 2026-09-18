<script setup>
import { computed, onMounted, ref } from 'vue'
import { WorkService } from '../application/work/workService.js'
import { TimelineService } from '../application/timeline/timelineService.js'
import { useFuelStore } from '../stores/fuel.js'
import { getKfeReferenceNow, istDateKey, istDayRange, istMonthRange, istParts } from '../domain/time/ist.js'

const fuelStore = useFuelStore()
const period = ref('day')
const anchor = ref(getKfeReferenceNow())
const data = ref(null)
const loading = ref(true)
const error = ref('')
const editing = ref(null)
const editingFuel = ref(null)
const form = ref({ operator: '', tripKm: '', revenue: '' })
const fuelForm = ref({ odometer: '', pricePerKg: '', amount: '', isFullTank: true })
const saving = ref(false)

const dayAtNoon = value => { const p = istParts(value); return p ? new Date(Date.UTC(p.year, p.month - 1, p.day, 12)) : new Date(value) }
const weekStart = value => { const day = dayAtNoon(value); return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000) }
const range = computed(() => {
  if (period.value === 'day' || period.value === 'personal') return istDayRange(anchor.value)
  if (period.value === 'week') { const start = weekStart(anchor.value); const end = new Date(start.getTime() + 6 * 86400000); return { from: istDayRange(start).from, to: istDayRange(end).to } }
  return istMonthRange(anchor.value, new Date(8640000000000000))
})
const dateFormatter = options => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options })
const label = computed(() => {
  if (period.value === 'personal') return `Personal · ${dateFormatter({ weekday:'long', day:'numeric', month:'short', year:'numeric' }).format(anchor.value)}`
  if (period.value === 'month') return dateFormatter({ month:'long', year:'numeric' }).format(anchor.value)
  if (period.value === 'week') { const start = weekStart(anchor.value); const end = new Date(start.getTime() + 6 * 86400000); return `${dateFormatter({day:'numeric',month:'short'}).format(start)} – ${dateFormatter({day:'numeric',month:'short',year:'numeric'}).format(end)}` }
  return dateFormatter({ weekday:'long', day:'numeric', month:'short', year:'numeric' }).format(anchor.value)
})
const monthWeekNumber = computed(() => { const first = dayAtNoon(new Date(Date.UTC(istParts(anchor.value).year, istParts(anchor.value).month - 1, 1, 12))); return Math.floor((weekStart(anchor.value) - weekStart(first)) / (7 * 86400000)) + 1 })
const breadcrumb = computed(() => {
  const month = dateFormatter({ month:'long', year:'numeric' }).format(anchor.value)
  if (period.value === 'month') return [month]
  if (period.value === 'week') return [month, `Week ${monthWeekNumber.value}`]
  if (period.value === 'personal') return ['Personal', dateFormatter({ weekday:'short', day:'numeric', month:'short' }).format(anchor.value)]
  return [month, `Week ${monthWeekNumber.value}`, dateFormatter({ weekday:'short', day:'numeric', month:'short' }).format(anchor.value)]
})
const money = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : `₹${Number(value).toLocaleString('en-IN',{maximumFractionDigits:0})}`
const km = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)} km`
const kg = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(2)} kg`
const time = value => value ? new Date(value).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}) : '—'
const dateTime = value => value ? new Date(value).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}) : '—'
const route = trip => `${trip.tripStartLocation?.address || trip.tripStartLocation?.name || 'Pickup'} → ${trip.tripEndLocation?.address || trip.tripEndLocation?.name || 'Drop'}`
const duration = trip => { const n = new Date(trip.tripEndAt) - new Date(trip.tripStartAt); return Number.isFinite(n) && n >= 0 ? `${Math.round(n/60000)} min` : '—' }
const shiftLabel = summary => { const starts=(summary?.shifts||[]).map(x=>x.shift.shiftStartAt).filter(Boolean).sort(); const ends=(summary?.shifts||[]).map(x=>x.shift.shiftEndAt).filter(Boolean).sort(); return starts.length ? `${time(starts[0])} → ${ends.length===starts.length ? time(ends[ends.length-1]) : 'Active'}` : '—' }
const load = async () => { loading.value=true; error.value=''; try { if(period.value==='day') data.value=await TimelineService.getDay(anchor.value); else if(period.value==='personal') data.value=await TimelineService.getPersonal(range.value); else if(period.value==='week') data.value=await TimelineService.getWeek(range.value); else data.value=await TimelineService.getMonth(range.value) } catch(e) { error.value=e?.message||'Unable to load timeline.'; data.value=null } finally { loading.value=false } }
const move = amount => { const d=dayAtNoon(anchor.value); if(period.value==='month') d.setUTCMonth(d.getUTCMonth()+amount); else if(period.value==='week') d.setUTCDate(d.getUTCDate()+amount*7); else d.setUTCDate(d.getUTCDate()+amount); anchor.value=d; void load() }
const choosePeriod = next => { period.value=next; void load() }
const today = () => { anchor.value=getKfeReferenceNow(); period.value='day'; void load() }
const openEdit = trip => { editing.value=trip; form.value={operator:trip.operator||'',tripKm:trip.tripKm??'',revenue:trip.revenue??''} }
const openFuelEdit = fuel => { editingFuel.value=fuel; fuelForm.value={odometer:fuel.odometer??'',pricePerKg:fuel.pricePerKg??'',amount:fuel.amount??'',isFullTank:fuel.isFullTank!==false} }
const save = async () => { saving.value=true; error.value=''; try { const r=await WorkService.updateTrip({id:editing.value.id,operator:form.value.operator,tripKm:form.value.tripKm,revenue:form.value.revenue}); if(!r?.ok) throw new Error(r?.reason||'Trip update failed.'); editing.value=null; await load() } catch(e) { error.value=e?.message||'Trip update failed.' } finally { saving.value=false } }
const saveFuel = async () => { saving.value=true; error.value=''; try { const r=await fuelStore.update({id:editingFuel.value.id,odometer:fuelForm.value.odometer,pricePerKg:fuelForm.value.pricePerKg,amount:fuelForm.value.amount,isFullTank:fuelForm.value.isFullTank}); if(!r?.ok) throw new Error(r?.reason||'Fuel update failed.'); editingFuel.value=null; await load() } catch(e) { error.value=e?.message||'Fuel update failed.' } finally { saving.value=false } }
const deleteFuel = async fuel => { if(!confirm(`Delete this fuel entry of ${kg(fuel.quantityKg)} at ${dateTime(fuel.capturedAt||fuel.createdAt)}?`)) return; saving.value=true; error.value=''; try { const r=await fuelStore.remove(fuel.id); if(!r?.ok) throw new Error(r?.reason||'Fuel delete failed.'); await load() } catch(e) { error.value=e?.message||'Fuel delete failed.' } finally { saving.value=false } }
const personalEntries = computed(() => data.value?.entries || [])
onMounted(load)
</script>

<template>
  <section class="timeline">
    <header><div><p class="eyebrow">TIMELINE</p><h1>{{ period==='personal' ? 'Personal Timeline' : label }}</h1></div><button class="today" @click="today">Today</button></header>
    <div class="breadcrumbs"><span v-for="(item,index) in breadcrumb" :key="`${item}-${index}`">{{item}}<b v-if="index<breadcrumb.length-1">›</b></span></div>
    <div class="slider"><button :class="{active:period==='day'}" @click="choosePeriod('day')">Day</button><button :class="{active:period==='personal'}" @click="choosePeriod('personal')">Personal</button><button :class="{active:period==='week'}" @click="choosePeriod('week')">Week</button><button :class="{active:period==='month'}" @click="choosePeriod('month')">Month</button></div>
    <div class="period"><button @click="move(-1)" aria-label="Previous">‹</button><strong>{{label}}</strong><button @click="move(1)" aria-label="Next">›</button></div>

    <p v-if="loading" class="state">Loading timeline…</p><p v-else-if="error" class="state error">{{error}}</p>

    <template v-else-if="period==='day' && data">
      <section class="day-snapshot"><div><span>Shift</span><strong>{{shiftLabel(data)}}</strong></div><div><span>Target</span><strong>{{money(data.target?.target)}}</strong></div><div><span>Rides</span><strong>{{data.rides}}</strong></div><div><span>Fuel</span><strong>{{kg(data.fuelQuantityKg)}} / {{money(data.fuelCost)}}</strong></div><div><span>Toll</span><strong>{{money(data.toll)}}</strong></div><div><span>Parking</span><strong>{{money(data.parking)}}</strong></div></section>
      <div v-if="!data.events.length" class="state">No ride or fuel events recorded for this day.</div>
      <div v-for="event in data.events" :key="`${event.type}-${event.id}`">
        <article v-if="event.type==='TRIP'" class="event"><time>{{time(event.record.tripStartAt)}}</time><div><div class="top"><strong>{{event.record.operator}}</strong><small>✓ Completed</small></div><div class="route">{{route(event.record)}}</div><div class="meta">{{event.record.revenue==null||event.record.revenue===''?'Fare —':money(event.record.revenue)}} · {{km(event.record.tripKm)}} · {{duration(event.record)}}</div></div><button class="edit" @click="openEdit(event.record)" aria-label="Edit trip">✎</button></article>
        <article v-else class="event fuel"><time>{{time(event.record.capturedAt||event.record.createdAt)}}</time><div><div class="top"><strong>⛽ CNG Refuelling</strong><small>{{event.record.isFullTank!==false?'Full tank':'Partial fill'}}</small></div><div class="meta">{{kg(event.record.quantityKg)}} · {{money(event.record.amount)}} · ₹{{Number(event.record.pricePerKg).toFixed(2)}}/kg</div></div><div class="actions"><button class="edit" @click="openFuelEdit(event.record)" aria-label="Edit fuel entry">✎</button><button class="delete" @click="deleteFuel(event.record)" aria-label="Delete fuel entry">⌫</button></div></article>
      </div>
    </template>

    <template v-else-if="period==='personal' && data">
      <section class="summary-card"><div><span>Personal KM</span><strong>{{km(data.totalKm)}}</strong></div><div><span>Toll</span><strong>{{money(data.totalToll)}}</strong></div><div><span>Parking</span><strong>{{money(data.totalParking)}}</strong></div></section>
      <div v-if="!personalEntries.length" class="state">No Personal KM recorded for this day.</div>
      <article v-for="entry in personalEntries" :key="entry.id" class="personal-event"><time>{{time(entry.startAt)}}</time><div><strong>Personal movement</strong><small>{{entry.endAt ? `${time(entry.startAt)} → ${time(entry.endAt)}` : 'Shift allocation'}}</small><span>{{km(entry.personalKm)}}</span><small>Personal toll {{money(entry.toll)}} · parking {{money(entry.parking)}}</small></div></article>
    </template>

    <template v-else-if="period==='week' && data">
      <section class="summary-card wide"><div><span>Authoritative Revenue</span><strong>{{money(data.authoritativeRevenue)}}</strong></div><div><span>Rides</span><strong>{{data.rides}}</strong></div><div><span>Fuel</span><strong>{{kg(data.fuelQuantityKg)}} / {{money(data.fuelCost)}}</strong></div><div><span>Toll / Parking</span><strong>{{money(data.toll)}} / {{money(data.parking)}}</strong></div></section>
      <div v-if="!data.days.length" class="state">No operational records in this week.</div>
      <div class="groups"><button v-for="day in data.days" :key="day.date" @click="anchor=dayAtNoon(day.date);period='day';load()"><span><b>{{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}}</b><small>{{day.shifts.length}} shift{{day.shifts.length===1?'':'s'}} · {{day.rides}} rides · {{km(day.businessKm)}}</small></span><strong>{{money(day.authoritativeRevenue)}}</strong><i>›</i></button></div>
    </template>

    <template v-else-if="period==='month' && data">
      <section class="summary-card wide"><div><span>Authoritative Revenue</span><strong>{{money(data.authoritativeRevenue)}}</strong></div><div><span>Rides</span><strong>{{data.rides}}</strong></div><div><span>Fuel</span><strong>{{kg(data.fuelQuantityKg)}} / {{money(data.fuelCost)}}</strong></div><div><span>Toll / Parking</span><strong>{{money(data.toll)}} / {{money(data.parking)}}</strong></div></section>
      <div v-if="!data.weeks.length" class="state">No operational records in this month.</div>
      <div class="groups"><button v-for="(week,index) in data.weeks" :key="week.start" @click="anchor=dayAtNoon(week.start);period='week';load()"><span><b>Week {{index+1}}</b><small>{{new Date(`${week.start}T12:00:00Z`).toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'UTC'})}} · {{week.shifts.length}} shifts · {{week.rides}} rides</small></span><strong>{{money(week.authoritativeRevenue)}}</strong><i>›</i></button></div>
    </template>

    <Teleport to="body">
      <div v-if="editing" class="overlay timeline-quick-edit-overlay" @click.self="editing=null"><form class="editor" @submit.prevent="save"><div class="editor-head"><div><p class="eyebrow">QUICK EDIT</p><h2>{{editing.operator}} · {{time(editing.tripStartAt)}}</h2></div><button type="button" @click="editing=null">×</button></div><label>Operator<select v-model="form.operator"><option v-for="o in WorkService.getTripOperators()" :key="o" :value="o">{{o}}</option></select></label><label>Distance (km)<input v-model="form.tripKm" type="number" min="0" step="0.1"></label><label>Fare (₹)<input v-model="form.revenue" type="number" min="0" step="1"></label><button class="save" :disabled="saving">{{saving?'Saving…':'Save'}}</button></form></div>
      <div v-if="editingFuel" class="overlay timeline-quick-edit-overlay" @click.self="editingFuel=null"><form class="editor" @submit.prevent="saveFuel"><div class="editor-head"><div><p class="eyebrow">FUEL EDIT</p><h2>{{dateTime(editingFuel.capturedAt||editingFuel.createdAt)}}</h2></div><button type="button" @click="editingFuel=null">×</button></div><label>Odometer (km)<input v-model="fuelForm.odometer" type="number" min="0" step="0.1"></label><label>Price per kg (₹)<input v-model="fuelForm.pricePerKg" type="number" min="0.01" step="0.01"></label><label>Amount (₹)<input v-model="fuelForm.amount" type="number" min="0.01" step="0.01"></label><div class="calculated">ERP recalculates quantity from amount ÷ price/kg.</div><label class="check"><input v-model="fuelForm.isFullTank" type="checkbox"> Full tank</label><button class="save" :disabled="saving">{{saving?'Saving…':'Save fuel changes'}}</button></form></div>
    </Teleport>
  </section>
</template>

