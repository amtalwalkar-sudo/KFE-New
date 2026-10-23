<script setup>
import { computed, onMounted, ref } from 'vue'
import { ActivityTimelineService } from '../application/timeline/activityTimelineService.js'
import { EventLocationService } from '../application/location/eventLocationService.js'
import { getKfeReferenceNow, istParts } from '../domain/time/ist.js'
import '../styles/activity-timeline.css'

const period = ref('today')
const tab = ref('rides')
const anchor = ref(getKfeReferenceNow())
const data = ref(null)
const loading = ref(true)
const error = ref('')
const labels = ref({})
const fuelLabels = ref({})
const dateAtNoon = value => {
  const p=istParts(value)
  return p ? new Date(Date.UTC(p.year,p.month-1,p.day,12)) : new Date(value)
}
const mondayOf = value => {
  const d=dateAtNoon(value)
  return new Date(d.getTime()-((d.getUTCDay()+6)%7)*86400000)
}
const rangeLabel = computed(()=>{
  const fmt=opts=>new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',...opts})
  if(period.value==='all') return 'All history'
  if(period.value==='today') return fmt({weekday:'long',day:'numeric',month:'short',year:'numeric'}).format(anchor.value)
  if(period.value==='month') return fmt({month:'long',year:'numeric'}).format(anchor.value)
  const start=mondayOf(anchor.value), end=new Date(start.getTime()+6*86400000)
  return `${fmt({day:'numeric',month:'short'}).format(start)} – ${fmt({day:'numeric',month:'short',year:'numeric'}).format(end)}`
})
const money=value=>value==null||!Number.isFinite(Number(value))?'Not enough data':`₹${Number(value).toLocaleString('en-IN',{maximumFractionDigits:2})}`
const km=value=>value==null||!Number.isFinite(Number(value))?'Not enough data':`${Number(value).toFixed(1)} km`
const kg=value=>value==null||!Number.isFinite(Number(value))?'Not enough data':`${Number(value).toFixed(2)} kg`
const stamp=value=>{
  if(value==null||value==='')return null
  const n=typeof value==='number'?value:Number(/^\d+(?:\.\d+)?$/.test(String(value).trim())?value:NaN)
  const d=Number.isFinite(n)?new Date(n<1e12?n*1000:n):new Date(value)
  return Number.isFinite(d.getTime())?d:null
}
const time=value=>{const d=stamp(value);return d?d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'}):'Time unavailable'}
const dateTime=value=>{const d=stamp(value);return d?d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}):'Time unavailable'}
const duration=(start,end)=>{
  const a=stamp(start),b=stamp(end)
  if(!a||!b||b<a)return 'Not recorded'
  const mins=Math.round((b-a)/60000)
  return mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins} min`
}
const tripPickupEnd=trip=>trip.tripStartAt|| (trip.status==='CANCELLED'?trip.tripEndAt:null)
const tripRideStart=trip=>trip.tripStartAt||(trip.status==='CANCELLED'?trip.createdAt:null)
const pickupDuration=trip=>duration(trip.createdAt,tripPickupEnd(trip))
const rideDuration=trip=>duration(tripRideStart(trip),trip.tripEndAt)
const route=trip=>`${labels.value[`${trip.id}:from`]||trip.tripStartLocation?.placeName||'Location unavailable'} → ${labels.value[`${trip.id}:to`]||trip.tripEndLocation?.placeName||'Location unavailable'}`
const loadLabels=async rows=>{
  const next={...labels.value}
  await Promise.allSettled(rows.map(async trip=>{
    const snapshots=await EventLocationService.forEntity('TRIP',trip.id)
    const pickup=snapshots.find(item=>item.eventType==='PICKUP_START')
    if(pickup&&!next[`${trip.id}:pickup`]){
      let name=pickup.placeName
      if(!name) name=await EventLocationService.resolveLabel(pickup)
      if(name){
        next[`${trip.id}:pickup`]=name
        if(!pickup.placeName) await EventLocationService.persistLabel(pickup.id,name)
      }
    }
    for(const [side,field] of [['from','tripStartLocation'],['to','tripEndLocation']]){
      const location=trip[field]
      if(next[`${trip.id}:${side}`]||location?.placeName){if(location?.placeName)next[`${trip.id}:${side}`]=location.placeName;continue}
      if(location?.latitude==null||location?.longitude==null)continue
      const name=await EventLocationService.resolveLabel(location)
      if(name){
        next[`${trip.id}:${side}`]=name
        await EventLocationService.persistTripBoundaryLabel(trip.id,field,name)
      }
    }
  }))
  labels.value=next
}
const loadFuelLabels=async rows=>{
  const next={...fuelLabels.value}
  await Promise.allSettled(rows.map(async row=>{
    if(next[row.id])return
    const snapshots=await EventLocationService.forEntity('FUEL',row.id)
    const snapshot=snapshots.find(item=>item.eventType==='FUEL_ENTRY')
    if(!snapshot)return
    let name=snapshot.placeName
    if(!name)name=await EventLocationService.resolveLabel(snapshot)
    if(name){next[row.id]=name;if(!snapshot.placeName)await EventLocationService.persistLabel(snapshot.id,name)}
  }))
  fuelLabels.value=next
}
const load=async()=>{
  loading.value=true;error.value=''
  try{
    data.value=await ActivityTimelineService.get({period:period.value,anchor:anchor.value})
    void loadLabels(data.value.trips)
    void loadFuelLabels(data.value.fuel)
  }catch(e){data.value=null;error.value=e?.message||'Unable to load activity timeline.'}
  finally{loading.value=false}
}
const selectPeriod=value=>{period.value=value;void load()}
const move=amount=>{
  const d=dateAtNoon(anchor.value)
  if(period.value==='week')d.setUTCDate(d.getUTCDate()+amount*7)
  else if(period.value==='month')d.setUTCMonth(d.getUTCMonth()+amount)
  else d.setUTCDate(d.getUTCDate()+amount)
  anchor.value=d;void load()
}
const tripFare=trip=>{
  if(trip.status==='CANCELLED')return trip.cancelledRevenue==null||trip.cancelledRevenue===''?'₹0 cancellation fee':money(trip.cancelledRevenue)
  if(trip.fareDetailsSkipped===true)return 'Fare skipped · ₹0'
  return trip.revenue==null||trip.revenue===''?'Fare unavailable':money(trip.revenue)
}
onMounted(load)
</script>

<template>
  <main class="activity-timeline">
    <header class="page-head">
      <div><p class="eyebrow">ACTIVITY</p><h1>Timeline</h1><p class="range-label">{{rangeLabel}}</p></div>
      <button class="today-button" @click="anchor=getKfeReferenceNow();period='today';load()">Today</button>
    </header>
    <nav class="period-tabs" aria-label="Timeline duration">
      <button v-for="item in [{id:'today',label:'Today'},{id:'week',label:'Week'},{id:'month',label:'Month'},{id:'all',label:'All'}]" :key="item.id" :class="{active:period===item.id}" @click="selectPeriod(item.id)">{{item.label}}</button>
    </nav>
    <nav class="record-tabs" aria-label="Activity type">
      <button :class="{active:tab==='rides'}" @click="tab='rides'"><span>Rides</span><small>{{data?.trips?.length??0}}</small></button>
      <button :class="{active:tab==='fuel'}" @click="tab='fuel'"><span>Fuel</span><small>{{data?.fuel?.length??0}}</small></button>
    </nav>
    <p v-if="loading" class="state">Loading timeline…</p>
    <p v-else-if="error" class="state error">{{error}}</p>
    <template v-else-if="data">
      <section v-if="tab==='rides'" class="metric-grid" aria-label="Ride summaries">
        <article class="metric"><span>Trip Hours</span><strong>{{data.metrics.tripDurationCount?`${data.metrics.tripHours.toFixed(1)} h`:'Not enough data'}}</strong></article>
        <article class="metric"><span>Average Fare per Hour</span><strong>{{money(data.metrics.averageFarePerHour)}}</strong></article>
        <article class="metric"><span>Total Pickup Travel Time</span><strong>{{data.metrics.pickupIntervals?`${Math.floor(data.metrics.totalPickupTravelMinutes/60)}h ${Math.round(data.metrics.totalPickupTravelMinutes%60)}m`:'Not enough data'}}</strong></article>
      </section>
      <section v-else class="metric-grid" aria-label="Fuel summaries">
        <article class="metric"><span>Average Cost per km</span><strong>{{data.metrics.averageCostPerKm==null?'Not enough data':money(data.metrics.averageCostPerKm)}}</strong></article>
        <article class="metric"><span>Average Mileage</span><strong>{{data.metrics.averageMileageKmPerKg==null?'Not enough data':`${data.metrics.averageMileageKmPerKg.toFixed(2)} km/kg`}}</strong></article>
      </section>
      <section v-if="tab==='rides'" class="event-list">
        <p v-if="!data.trips.length" class="empty">No rides recorded for this period.</p>
        <article v-for="trip in data.trips" :key="trip.id" class="activity-card" :class="{'cancelled':trip.status==='CANCELLED'}">
          <div class="event-top"><div><span class="event-date">{{dateTime(trip.tripStartAt||trip.createdAt)}}</span><h2>{{trip.status==='CANCELLED'?'Cancelled ride':'Ride'}}</h2></div><span class="status">{{trip.status==='CANCELLED'?'Cancelled':'Completed'}}</span></div>
          <div class="route"><span class="route-dot"></span><span>{{route(trip)}}</span></div>
          <p v-if="labels[`${trip.id}:pickup`]" class="note">Pickup journey started near {{labels[`${trip.id}:pickup`]}}</p>
          <div class="details"><span><small>{{trip.status==='CANCELLED'?'Cancellation fee':'Fare'}}</small><strong>{{tripFare(trip)}}</strong></span><span><small>Ride duration</small><strong>{{rideDuration(trip)}}</strong></span><span><small>Pickup travel</small><strong>{{pickupDuration(trip)}}</strong></span></div>
          <p v-if="trip.fareDetailsSkipped===true" class="note">Fare details were skipped; revenue contribution is ₹0.</p>
          <p v-if="trip.status==='CANCELLED'&&trip.cancelReason" class="note">Reason: {{trip.cancelReason}}</p>
        </article>
      </section>
      <section v-else class="event-list">
        <p v-if="!data.fuel.length" class="empty">No fuel entries recorded for this period.</p>
        <article v-for="row in data.fuel" :key="row.id" class="activity-card fuel-card">
          <div class="event-top"><div><span class="event-date">{{dateTime(row.capturedAt||row.createdAt)}}</span><h2>CNG refuelling</h2></div><span class="status">{{row.isFullTank===true?'Full tank':'Partial fill'}}</span></div>
          <p v-if="fuelLabels[row.id]" class="note">{{fuelLabels[row.id]}}</p>
          <div class="details"><span><small>Amount paid</small><strong>{{money(row.amount)}}</strong></span><span><small>Fuel quantity</small><strong>{{kg(row.quantityKg)}}</strong></span><span><small>Odometer</small><strong>{{km(row.odometer)}}</strong></span></div>
        </article>
      </section>
    </template>
  </main>
</template>


