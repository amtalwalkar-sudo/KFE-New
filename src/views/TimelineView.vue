<script setup>
import { computed, onMounted, ref } from 'vue'
import { WorkService } from '../application/work/workService.js'
import { useFuelStore } from '../stores/fuel.js'

const fuelStore = useFuelStore()
const period = ref('day')
const operator = ref('All')
const showOperators = ref(false)
const anchor = ref(new Date())
const trips = ref([])
const loading = ref(true)
const error = ref('')
const editing = ref(null)
const editingFuel = ref(null)
const form = ref({ operator: '', tripKm: '', revenue: '' })
const fuelForm = ref({ odometer: '', pricePerKg: '', amount: '', isFullTank: true })
const saving = ref(false)
const operators = ['All', ...WorkService.getTripOperators()]

const dayStart = d => { const x = new Date(d); x.setHours(0,0,0,0); return x }
const weekStart = d => { const x = dayStart(d); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1-day)); return x }
const range = computed(() => {
  const d = new Date(anchor.value)
  if (period.value === 'month') { const s = dayStart(d); s.setDate(1); const e = new Date(s); e.setMonth(e.getMonth()+1); return [s,e] }
  if (period.value === 'week') { const s = weekStart(d); const e = new Date(s); e.setDate(e.getDate()+7); return [s,e] }
  const s = dayStart(d); const e = new Date(s); e.setDate(e.getDate()+1); return [s,e]
})
const visibleTrips = computed(() => trips.value.filter(t => t?.status === 'COMPLETED').filter(t => operator.value === 'All' || t.operator === operator.value).filter(t => { const time = new Date(t.tripStartAt).getTime(); return Number.isFinite(time) && time >= range.value[0].getTime() && time < range.value[1].getTime() }).sort((a,b) => new Date(a.tripStartAt)-new Date(b.tripStartAt)))
const visibleFuel = computed(() => fuelStore.logs.filter(f => { const time = new Date(f.capturedAt || f.createdAt).getTime(); return Number.isFinite(time) && time >= range.value[0].getTime() && time < range.value[1].getTime() }).sort((a,b) => new Date(a.capturedAt || a.createdAt)-new Date(b.capturedAt || b.createdAt)))
const days = computed(() => { const m = new Map(); for (const t of visibleTrips.value) { const k = dayStart(t.tripStartAt).getTime(); if (!m.has(k)) m.set(k,[]); m.get(k).push(t) } return [...m.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>({date:new Date(k),trips:v})) })
const monthWeeks = computed(() => { const out=[]; let cursor=new Date(range.value[0]); while(cursor<range.value[1]) { const ws=weekStart(cursor); const we=new Date(ws); we.setDate(we.getDate()+7); const s=new Date(Math.max(ws,range.value[0])); const e=new Date(Math.min(we,range.value[1])); const items=visibleTrips.value.filter(t=>{const n=new Date(t.tripStartAt).getTime();return n>=s.getTime()&&n<e.getTime()}); out.push({start:s,end:e,trips:items}); cursor.setDate(cursor.getDate()+7) } return out })
const totalKm = computed(() => visibleTrips.value.reduce((n,t)=>n+(Number.isFinite(Number(t.tripKm))?Number(t.tripKm):0),0))
const totalRevenue = computed(() => visibleTrips.value.reduce((n,t)=>n+(Number.isFinite(Number(t.revenue))?Number(t.revenue):0),0))
const totalFuel = computed(() => visibleFuel.value.reduce((n,f)=>n+(Number.isFinite(Number(f.quantityKg))?Number(f.quantityKg):0),0))
const label = computed(() => period.value==='month' ? range.value[0].toLocaleDateString('en-IN',{month:'long',year:'numeric'}) : period.value==='week' ? `${range.value[0].toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – ${new Date(range.value[1]-86400000).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}` : anchor.value.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short',year:'numeric'}))
const time = v => new Date(v).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'})
const dateTime = v => new Date(v).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'})
const money = v => Number.isFinite(Number(v)) ? `₹${Number(v).toLocaleString('en-IN',{maximumFractionDigits:0})}` : '—'
const km = v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)} km` : '—'
const kg = v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)} kg` : '—'
const duration = t => { const n=new Date(t.tripEndAt)-new Date(t.tripStartAt); return Number.isFinite(n)&&n>=0?`${Math.round(n/60000)} min`:'—' }
const route = t => `${t.tripStartLocation?.address || t.tripStartLocation?.name || 'Pickup'} → ${t.tripEndLocation?.address || t.tripEndLocation?.name || 'Drop'}`
const load = async () => { loading.value=true; error.value=''; try { trips.value=await WorkService.getAllTrips(); await fuelStore.refresh() } catch(e) { error.value=e?.message||'Unable to load timeline.' } finally { loading.value=false } }
const move = n => { const d=new Date(anchor.value); if(period.value==='month') d.setMonth(d.getMonth()+n); else if(period.value==='week') d.setDate(d.getDate()+7*n); else d.setDate(d.getDate()+n); anchor.value=d }
const choosePeriod = p => { period.value=p; showOperators.value=false }
const chooseOperator = o => { operator.value=o; showOperators.value=false }
const openEdit = t => { editing.value=t; form.value={operator:t.operator||'',tripKm:t.tripKm??'',revenue:t.revenue??''} }
const openFuelEdit = fuel => { editingFuel.value=fuel; fuelForm.value={odometer:fuel.odometer??'',pricePerKg:fuel.pricePerKg??'',amount:fuel.amount??'',isFullTank:fuel.isFullTank !== false} }
const save = async () => { saving.value=true; error.value=''; try { const r=await WorkService.updateTrip({id:editing.value.id,operator:form.value.operator,tripKm:form.value.tripKm,revenue:form.value.revenue}); if(!r?.ok) throw new Error(r?.reason||'Trip update failed.'); await load(); editing.value=null } catch(e) { error.value=e?.message||'Trip update failed.' } finally { saving.value=false } }
const saveFuel = async () => { saving.value=true; error.value=''; try { const r=await fuelStore.update({id:editingFuel.value.id,odometer:fuelForm.value.odometer,pricePerKg:fuelForm.value.pricePerKg,amount:fuelForm.value.amount,isFullTank:fuelForm.value.isFullTank}); if(!r?.ok) throw new Error(r?.reason||'Fuel update failed.'); await load(); editingFuel.value=null } catch(e) { error.value=e?.message||'Fuel update failed.' } finally { saving.value=false } }
const deleteFuel = async fuel => { if(!confirm(`Delete this fuel entry of ${kg(fuel.quantityKg)} at ${dateTime(fuel.capturedAt || fuel.createdAt)}?`)) return; saving.value=true; error.value=''; try { const r=await fuelStore.remove(fuel.id); if(!r?.ok) throw new Error(r?.reason||'Fuel delete failed.'); await load() } catch(e) { error.value=e?.message||'Fuel delete failed.' } finally { saving.value=false } }
onMounted(load)
</script>

<template>
  <section class="timeline">
    <header><div><p class="eyebrow">TIMELINE</p><h1>{{ label }}</h1></div><button class="today" @click="anchor=new Date();period='day'">Today</button></header>
    <div class="slider">
      <button :class="{active:period==='week'}" @click="choosePeriod('week')">Week</button>
      <button :class="{active:period==='month'}" @click="choosePeriod('month')">Month</button>
      <button :class="{active:showOperators||operator!=='All'}" @click="showOperators=!showOperators">Operator</button>
    </div>
    <div v-if="showOperators" class="operators"><button v-for="o in operators" :key="o" :class="{selected:operator===o}" @click="chooseOperator(o)">{{o}}</button></div>
    <div v-if="operator!=='All'" class="filter">Operator: {{operator}} <button @click="chooseOperator('All')">×</button></div>
    <div class="period"><button @click="move(-1)" aria-label="Previous">‹</button><strong>{{label}}</strong><button @click="move(1)" aria-label="Next">›</button></div>
    <div class="summary"><span>{{visibleTrips.length}} trips</span><span>{{km(totalKm)}}</span><span>{{money(totalRevenue)}}</span><span>{{visibleFuel.length}} fuel · {{kg(totalFuel)}}</span></div>

    <p v-if="loading" class="state">Loading timeline…</p>
    <p v-else-if="error" class="state error">{{error}}</p>
    <p v-else-if="!visibleTrips.length && !visibleFuel.length" class="state">No operational records in this period.</p>

    <div v-else-if="period==='day'">
      <article v-for="t in visibleTrips" :key="`trip-${t.id}`" class="trip"><time>{{time(t.tripStartAt)}}</time><div><div class="top"><strong>{{t.operator}}</strong><small>✓ Completed</small></div><div class="route">{{route(t)}}</div><div class="meta">{{money(t.revenue)}} · {{km(t.tripKm)}} · {{duration(t)}}</div></div><button class="edit" @click="openEdit(t)" aria-label="Edit trip">✎</button></article>
      <article v-for="fuel in visibleFuel" :key="`fuel-${fuel.id}`" class="fuel"><time>{{time(fuel.capturedAt || fuel.createdAt)}}</time><div><div class="top"><strong>⛽ CNG Refuelling</strong><small>{{fuel.isFullTank !== false ? 'Full tank' : 'Partial fill'}}</small></div><div class="meta">{{kg(fuel.quantityKg)}} · {{money(fuel.amount)}} · ₹{{Number(fuel.pricePerKg).toFixed(2)}}/kg · Odo {{Number(fuel.odometer).toLocaleString('en-IN')}} km</div></div><div class="actions"><button class="edit" @click="openFuelEdit(fuel)" aria-label="Edit fuel entry">✎</button><button class="delete" @click="deleteFuel(fuel)" aria-label="Delete fuel entry">⌫</button></div></article>
    </div>
    <div v-else-if="period==='week'" class="groups"><button v-for="g in days" :key="g.date.getTime()" @click="anchor=g.date;period='day'"><span><b>{{g.date.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}}</b><small>{{g.trips.length}} trips</small></span><strong>{{money(g.trips.reduce((n,t)=>n+Number(t.revenue||0),0))}}</strong><i>›</i></button></div>
    <div v-else class="groups"><button v-for="(g,i) in monthWeeks" :key="i" @click="anchor=g.start;period='week'"><span><b>Week {{i+1}}</b><small>{{g.start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}} – {{new Date(g.end-86400000).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}}</small></span><strong>{{g.trips.length}} trips · {{money(g.trips.reduce((n,t)=>n+Number(t.revenue||0),0))}}</strong><i>›</i></button></div>

    <div v-if="editing" class="overlay" @click.self="editing=null"><form class="editor" @submit.prevent="save"><div class="editor-head"><div><p class="eyebrow">QUICK EDIT</p><h2>{{editing.operator}} · {{time(editing.tripStartAt)}}</h2></div><button type="button" @click="editing=null">×</button></div><label>Operator<select v-model="form.operator"><option v-for="o in WorkService.getTripOperators()" :key="o" :value="o">{{o}}</option></select></label><label>Distance (km)<input v-model="form.tripKm" type="number" min="0" step="0.1"></label><label>Fare (₹)<input v-model="form.revenue" type="number" min="0" step="1"></label><button class="save" :disabled="saving">{{saving?'Saving…':'Save'}}</button></form></div>
    <div v-if="editingFuel" class="overlay" @click.self="editingFuel=null"><form class="editor" @submit.prevent="saveFuel"><div class="editor-head"><div><p class="eyebrow">FUEL EDIT</p><h2>{{dateTime(editingFuel.capturedAt || editingFuel.createdAt)}}</h2></div><button type="button" @click="editingFuel=null">×</button></div><label>Odometer (km)<input v-model="fuelForm.odometer" type="number" min="0" step="0.1"></label><label>Price per kg (₹)<input v-model="fuelForm.pricePerKg" type="number" min="0.01" step="0.01"></label><label>Amount (₹)<input v-model="fuelForm.amount" type="number" min="0.01" step="0.01"></label><div class="calculated">ERP recalculates quantity from amount ÷ price/kg.</div><label class="check"><input v-model="fuelForm.isFullTank" type="checkbox"> Full tank</label><button class="save" :disabled="saving">{{saving?'Saving…':'Save fuel changes'}}</button></form></div>
  </section>
</template>

<style scoped>
.timeline{max-width:760px;margin:auto;padding:20px 16px 30px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.eyebrow{margin:0 0 4px;font-size:.62rem;font-weight:900;letter-spacing:.1em;color:var(--kfe-muted-text,#667085)}h1{margin:0;font-size:1.2rem}.today,.period button,.edit,.delete,.editor-head button{border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:10px;color:var(--kfe-ui-text,#101828);font-weight:850}.today{padding:9px 12px}.slider{display:flex;gap:5px;padding:5px;border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:14px}.slider button{flex:1;border:0;border-radius:10px;padding:10px;background:transparent;color:var(--kfe-muted-text,#667085);font:inherit;font-size:.72rem;font-weight:850}.slider button.active{background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb)}.operators{display:flex;gap:7px;overflow:auto;padding:9px 0}.operators button{white-space:nowrap;border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:999px;padding:8px 12px;font-size:.68rem;font-weight:800}.operators button.selected{background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb);border-color:var(--kfe-ui-accent,#2563eb)}.filter{display:inline-flex;gap:5px;margin:5px 0;padding:6px 9px;border-radius:999px;background:var(--kfe-accent-soft,#eff6ff);color:var(--kfe-ui-accent,#2563eb);font-size:.66rem;font-weight:850}.filter button{border:0;background:transparent;color:inherit;font-size:1rem}.period{display:flex;align-items:center;justify-content:space-between;margin:10px 0}.period button{width:38px;height:38px;font-size:1.4rem}.period strong{font-size:.8rem;text-align:center}.summary{display:flex;gap:7px;margin-bottom:12px;overflow:auto}.summary span{min-width:88px;flex:1;padding:9px 5px;text-align:center;border:1px solid var(--kfe-ui-border,#e4e7ec);border-radius:11px;background:var(--kfe-ui-surface,#fff);font-size:.62rem;font-weight:850}.trip,.fuel,.groups button{width:100%;box-sizing:border-box;border:1px solid var(--kfe-ui-border,#e4e7ec);background:var(--kfe-ui-surface,#fff);border-radius:14px}.trip,.fuel{display:grid;grid-template-columns:52px 1fr 72px;gap:8px;align-items:center;padding:12px;margin-bottom:8px}.trip time,.fuel time{font-size:.67rem;font-weight:900;color:var(--kfe-muted-text,#667085)}.top{display:flex;gap:8px;align-items:center}.top strong{font-size:.77rem}.top small{font-size:.55rem;color:var(--kfe-success,#079455);font-weight:800}.route{margin-top:3px;font-size:.74rem;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.meta{margin-top:4px;font-size:.62rem;color:var(--kfe-muted-text,#667085);font-weight:700}.edit,.delete{width:34px;height:34px;color:var(--kfe-ui-accent,#2563eb)}.delete{color:var(--kfe-danger,#d92d20)}.actions{display:flex;gap:4px;justify-content:flex-end}.fuel .top small{color:var(--kfe-muted-text,#667085)}.groups button{display:grid;grid-template-columns:1fr auto 18px;gap:8px;align-items:center;padding:13px;margin-bottom:8px;text-align:left}.groups span{display:grid;gap:3px}.groups b{font-size:.75rem}.groups small,.groups strong{font-size:.62rem;color:var(--kfe-muted-text,#667085)}.groups i{font-style:normal;font-size:1.1rem}.state{text-align:center;padding:40px 12px;color:var(--kfe-muted-text,#667085);font-size:.78rem}.error{color:var(--kfe-danger,#d92d20)}.overlay{position:fixed;inset:0;z-index:15000;display:grid;align-items:end;padding:16px;background:rgba(16,24,40,.42)}.editor{width:min(560px,100%);box-sizing:border-box;margin:auto auto 0;padding:18px;border-radius:18px;background:var(--kfe-ui-surface,#fff);display:grid;gap:12px}.editor-head{display:flex;justify-content:space-between}.editor-head h2{margin:0;font-size:1rem}.editor-head button{border:0;background:transparent;font-size:1.4rem}.editor label{display:grid;gap:5px;font-size:.68rem;font-weight:850;color:var(--kfe-muted-text,#667085)}select,input{min-height:44px;padding:9px;border:1px solid var(--kfe-ui-border,#d0d5dd);border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);font:inherit}.check{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px}.check input{min-height:auto}.calculated{padding:10px;border-radius:10px;background:var(--kfe-ui-bg,#f5f7fb);font-size:.68rem;color:var(--kfe-muted-text,#667085);font-weight:750}.save{min-height:46px;border:0;border-radius:11px;background:var(--kfe-ui-accent,#2563eb);color:#fff;font-weight:900}.save:disabled{opacity:.6}
</style>
