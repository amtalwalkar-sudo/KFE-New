<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { DriverTargetService } from '../application/performance/driverTargetService.js'
import { getKfeReferenceNow } from '../domain/time/ist.js'

const store = useShiftTripStore()
const fuelStore = useFuelStore()
const startOdo = ref('')
const gapCategory = ref(null)
const personalToll = ref('')
const personalParking = ref('')
const selectedOperator = ref('')
const closingOdo = ref('')
const shiftRevenue = ref('')
const toll = ref('')
const parking = ref('')
const tollTreatment = ref('NONE')
const reviewTrips = ref(false)
const cancelPanel = ref(false)
const cancelReason = ref('DRIVER_MISTAKE')
const cancelledRevenue = ref('')
const fuelFormOpen = ref(false)
const fuelOdometer = ref('')
const fuelPrice = ref('')
const fuelAmount = ref('')
const message = ref('')
const error = ref('')
const target = ref(null)
const clock = ref(Date.now())
const swipeStartX = ref(null)
const swipeTracking = ref(false)
const swipeOffset = ref(0)
let interval
let unsubscribeTarget

const gap = computed(() => store.calculateGap(startOdo.value))
const gapKm = computed(() => Number(gap.value?.gapKm || 0))
const gapPersonal = computed(() => gapCategory.value === 'PERSONAL' ? gapKm.value : 0)
const gapDead = computed(() => gapCategory.value === 'DEAD' ? gapKm.value : 0)
const allocatedGap = computed(() => gapCategory.value ? gapKm.value : 0)
const fuelQuantity = computed(() => fuelStore.calculateQuantity(fuelPrice.value, fuelAmount.value))
const targetValue = computed(() => target.value?.target !== null && target.value?.target !== undefined && Number.isFinite(Number(target.value.target)) ? Number(target.value.target) : null)
const targetText = computed(() => targetValue.value == null ? '—' : `₹${targetValue.value.toLocaleString('en-IN',{maximumFractionDigits:0})}`)
const tripTimer = computed(() => {
  if (!store.trip?.tripStartAt) return '00:00:00'
  const seconds = Math.max(0, Math.floor((clock.value - Date.parse(store.trip.tripStartAt)) / 1000))
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
const locationEventLabel = eventType => ({ ONLINE: 'Online', OFFLINE: 'Offline', START: 'Trip start', END: 'Trip end', CANCELLED: 'Trip cancelled' }[eventType] || eventType || 'Location')
const locationPlace = location => location?.placeName || (Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude)) ? `${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}` : 'Location unavailable')
const locationTime = location => location?.capturedAt ? new Date(location.capturedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'Time unavailable'
const notify = text => { message.value = text; error.value = ''; window.setTimeout(() => { if (message.value === text) message.value = '' }, 2200) }
const fail = text => { error.value = text; message.value = '' }
const refreshTarget = async () => { try { target.value = await DriverTargetService.getTarget(getKfeReferenceNow()) } catch (_) { target.value = null } }
const selectGapCategory = category => { if (!gap.value.valid || gapKm.value <= 0) return; gapCategory.value = category; if (category !== 'PERSONAL') { personalToll.value = ''; personalParking.value = '' } }
const goOnline = async () => { const needsGap = gap.value.valid && gapKm.value > 0; const result = await store.startShift(startOdo.value, needsGap ? { category: gapCategory.value, personalToll: personalToll.value, personalParking: personalParking.value } : null); if (result.requiresGapAllocation) return fail(`Choose Personal KM or Dead KM to allocate the full ${result.gapKm} km before going Online.`); if (!result.ok) return fail(result.reason); startOdo.value=''; gapCategory.value=null; personalToll.value=''; personalParking.value=''; await refreshTarget(); notify('Online.') }
const goOffline = async (confirmLargeDistance = false) => { const trips = reviewTrips.value ? store.completedTrips.map(t => ({ id:t.id, operator:t.operator, tripKm:t.tripKm??'', revenue:t.revenue??'' })) : []; const result = await store.endShift({ closingOdometer:closingOdo.value, revenue:shiftRevenue.value, toll:toll.value, parking:parking.value, tollParkingRevenueTreatment:tollTreatment.value, trips, confirmLargeDistance }); if(result.requiresConfirmation){ const confirmed=window.confirm(`⚠️ Closing odometer shows ${result.distanceKm} km for this shift. This is above the 500 km/day safety threshold. If the odometer is correct, confirm to end the Shift.`); if(!confirmed)return; return goOffline(true) } if(!result.ok)return fail(result.reason); closingOdo.value=''; shiftRevenue.value=''; toll.value=''; parking.value=''; tollTreatment.value='NONE'; reviewTrips.value=false; await refreshTarget(); notify('Offline.') }
const toggleOnline = async () => { if(store.isTripActive)return fail('End the active Trip before going Offline.'); return store.isOnline ? goOffline() : goOnline() }
const startTrip = async () => { const result=await store.startTrip(selectedOperator.value||store.defaultOperator); if(!result.ok)return fail(result.reason); selectedOperator.value=result.trip.operator; notify('Trip started.') }
const endTrip = async () => { if(await store.endTrip()){ await refreshTarget(); notify('Trip completed.') } }
const cancelAccidentalTrip = async () => { if(!confirm('Cancel this accidental trip? It will be recorded as a cancelled driver-mistake trip.'))return; if(await store.cancelTrip({reason:'DRIVER_MISTAKE'})){await refreshTarget();notify('Accidental trip cancelled.')} }
const cancelTripWithRevenue = async () => { if(!confirm('Record this trip as cancelled? Optional revenue will be retained if entered.'))return; if(await store.cancelTrip({reason:cancelReason.value,revenue:cancelledRevenue.value})){cancelledRevenue.value='';cancelPanel.value=false;await refreshTarget();notify('Cancelled trip recorded.')} }
const saveFuel = async () => { const result=await fuelStore.save({odometer:fuelOdometer.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value}); if(!result.ok)return fail(result.reason); fuelOdometer.value='';fuelPrice.value='';fuelAmount.value='';fuelFormOpen.value=false;notify(`Refuelling recorded: ${result.record.quantityKg.toFixed(2)} kg.`) }
const primaryTripAction = () => store.isTripActive ? endTrip() : startTrip()
const tripActionLabel = computed(() => store.isTripActive ? 'SWIPE → END TRIP' : 'SWIPE → START TRIP')
const tripActionHint = computed(() => store.isTripActive ? 'Swipe from left to right to end this trip' : 'Swipe from left to right to start this trip')
const swipeStyle = computed(() => ({transform:`translateX(${swipeOffset.value}px)`}))
const onSwipeStart = event => { if(event.pointerType==='mouse'&&event.button!==0)return; swipeStartX.value=event.clientX;swipeTracking.value=true;swipeOffset.value=0;event.currentTarget.setPointerCapture?.(event.pointerId) }
const onSwipeMove = event => { if(!swipeTracking.value||swipeStartX.value==null)return; swipeOffset.value=Math.max(0,Math.min(event.clientX-swipeStartX.value,120)) }
const onSwipeEnd = async event => { if(!swipeTracking.value||swipeStartX.value==null)return; const distance=event.clientX-swipeStartX.value;swipeTracking.value=false;swipeStartX.value=null;swipeOffset.value=0;if(distance>=80)await primaryTripAction() }
const onSwipeCancel = () => { swipeTracking.value=false;swipeStartX.value=null;swipeOffset.value=0 }
const onSwipeKey = async event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();await primaryTripAction()} }
onMounted(async()=>{await store.initialize();await fuelStore.refresh();await refreshTarget();startOdo.value=store.lastKnownOdometer??'';selectedOperator.value=store.defaultOperator;unsubscribeTarget=DriverTargetService.subscribeDataChanges(()=>{void refreshTarget()});interval=window.setInterval(()=>{clock.value=Date.now()},1000)})
onUnmounted(()=>{window.clearInterval(interval);unsubscribeTarget?.()})
</script>

<template>
  <div class="cockpit">
    <header class="hero"><div><small>KFE WORK</small><h1>Driver Cockpit</h1></div><div class="online-control"><span>OFFLINE</span><button class="online-toggle" :class="{active:store.isOnline}" :disabled="store.isTripActive" role="switch" :aria-checked="store.isOnline" :aria-label="store.isOnline ? 'Go Offline' : 'Go Online'" @click="toggleOnline"><span/></button><span>ONLINE</span></div></header>
    <div v-if="message" class="message">{{message}}</div><div v-if="error" class="error">{{error}}</div>
    <section v-if="!store.isTripActive" class="target-card"><small>TODAY'S TARGET</small><strong>{{targetText}}</strong></section>
    <section class="card state"><div><span>Shift</span><strong>{{store.isOnline?'Active':'Ready'}}</strong></div><div><span>Financial Day</span><strong>{{store.isFinancialDayActive?'Active':'Not active'}}</strong></div></section>
    <section v-if="!store.isOnline" class="card gate"><h2>Start Shift</h2><p class="muted">The Online toggle opens this gate. The shift starts only after the odometer check succeeds.</p><label>Current odometer (km)<input v-model="startOdo" type="number" min="0" inputmode="decimal"></label><div v-if="gap.valid&&gapKm>0" class="gap"><strong>Odometer gap: {{gapKm}} km</strong><p>ERP calculates the gap. Choose one category and the entire gap is assigned to it.</p><div class="allocation-summary"><div><span>Personal KM</span><strong>{{gapPersonal}}</strong></div><div><span>Dead KM</span><strong>{{gapDead}}</strong></div></div><div class="allocation-actions"><button type="button" :class="{selected:gapCategory==='PERSONAL'}" @click="selectGapCategory('PERSONAL')">Personal KM · {{gapKm}} km</button><button type="button" :class="{selected:gapCategory==='DEAD'}" @click="selectGapCategory('DEAD')">Dead KM · {{gapKm}} km</button></div><small v-if="gapCategory">Allocated {{allocatedGap}} / {{gapKm}} km to {{gapCategory==='PERSONAL'?'Personal KM':'Dead KM'}}.</small><small v-else>Choose Personal KM or Dead KM to continue.</small><div v-if="gapCategory==='PERSONAL'" class="two"><label>Personal toll (optional)<input v-model="personalToll" type="number" min="0" step="0.01"></label><label>Personal parking (optional)<input v-model="personalParking" type="number" min="0" step="0.01"></label></div></div><p v-else-if="gap.valid" class="muted">No odometer gap.</p><p v-else-if="startOdo" class="error-text">{{gap.reason}}</p></section>
    <section v-else-if="!store.isTripActive" class="card gate"><h2>Start Trip</h2><div class="current-operator"><span>Operator for this trip</span><strong>{{selectedOperator||store.defaultOperator}}</strong></div><p class="muted">Check this before every ride. The selected operator carries forward until changed.</p><div class="operators"><button v-for="operator in store.operators" :key="operator" :class="{selected:(selectedOperator||store.defaultOperator)===operator}" @click="selectedOperator=operator">{{operator}}</button></div></section>
    <section v-if="store.isTripActive" class="card trip"><small>TRIP ACTIVE</small><h2>{{store.trip.operator}}</h2><div class="cockpit-target"><span>TODAY'S TARGET</span><strong>{{targetText}}</strong></div><div class="timer">{{tripTimer}}</div><button class="quiet" @click="cancelAccidentalTrip">Cancel accidental trip</button><button class="secondary" @click="cancelPanel=!cancelPanel">Record cancelled trip / revenue</button><div v-if="cancelPanel" class="cancel-panel"><label>Cancellation reason<select v-model="cancelReason"><option value="DRIVER_MISTAKE">Driver mistake</option><option value="OPERATOR_CANCELLED">Operator cancelled</option><option value="CUSTOMER_CANCELLED">Customer cancelled</option></select></label><label>Revenue if applicable (optional)<input v-model="cancelledRevenue" type="number" min="0" step="0.01"></label><button class="danger" @click="cancelTripWithRevenue">Record cancellation</button></div></section>
    <section v-if="store.lifecycleLocations.length" class="card locations"><div class="section-heading"><div><small>SHIFT GPS</small><h2>Location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.lifecycleLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{locationEventLabel(location.eventType)}}</strong><span>{{locationPlace(location)}}</span><small>{{locationTime(location)}}</small></div></div></section>
    <section v-if="store.tripLocations.length" class="card locations"><div class="section-heading"><div><small>TRIP GPS</small><h2>Trip location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.tripLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{locationEventLabel(location.eventType)}}</strong><span>{{locationPlace(location)}}</span><small>{{locationTime(location)}}</small></div></div></section>
    <section v-if="store.isOnline&&!store.isTripActive" class="card gate"><h2>CNG Refuelling</h2><p class="muted">ERP calculates quantity from amount ÷ price per kg. GPS and timestamp are captured automatically when available.</p><button class="secondary" @click="fuelFormOpen=!fuelFormOpen">{{fuelFormOpen?'Hide fuel form':'Add refuelling'}}</button><div v-if="fuelFormOpen" class="fuel-form"><label>Odometer (km)<input v-model="fuelOdometer" type="number" min="0"></label><label>Price per kg (₹)<input v-model="fuelPrice" type="number" min="0" step="0.01"></label><label>Amount (₹)<input v-model="fuelAmount" type="number" min="0" step="0.01"></label><div class="calculated"><span>ERP-calculated quantity</span><strong>{{fuelQuantity.toFixed(2)}} kg</strong></div><button class="primary" :disabled="fuelStore.saving" @click="saveFuel">{{fuelStore.saving?'Saving…':'Save refuelling'}}</button></div></section>
    <section v-if="store.isOnline&&!store.isTripActive" class="card gate"><h2>End Shift</h2><p class="muted">Closing odometer and total shift revenue are required. Trip fares are supporting detail only.</p><label>Closing odometer (km)<input v-model="closingOdo" type="number" min="0"></label><label>Total shift revenue (₹)<input v-model="shiftRevenue" type="number" min="0" step="0.01" placeholder="Enter total shift revenue"></label><div class="two"><label>Business toll (optional)<input v-model="toll" type="number" min="0" step="0.01"></label><label>Business parking (optional)<input v-model="parking" type="number" min="0" step="0.01"></label></div><label v-if="Number(toll||0)>0||Number(parking||0)>0">Business toll/parking treatment<select v-model="tollTreatment"><option value="NONE">None</option><option value="INCLUDED">Included in revenue/fare</option><option value="EXCLUDED">Excluded from revenue/fare</option></select></label><button class="secondary" @click="reviewTrips=!reviewTrips">{{reviewTrips?'Hide optional trip review':'Optional trip review / correction'}}</button><div v-if="reviewTrips" class="reviews"><p v-if="!store.completedTrips.length" class="muted">No completed trips.</p><div v-for="t in store.completedTrips" :key="t.id" class="review"><select v-model="t.operator"><option v-for="operator in store.operators" :key="operator">{{operator}}</option></select><input v-model="t.tripKm" type="number" min="0" step="0.1" placeholder="KM optional"><input v-model="t.revenue" type="number" min="0" step="0.01" placeholder="₹ optional"></div></div></section>
    <div v-if="store.isOnline" class="action-reserve"></div><div v-if="store.isOnline" class="persistent-action"><div class="swipe-bar trip-action" :style="swipeStyle" role="button" tabindex="0" aria-label="Swipe from left to right to start or end the current trip" @pointerdown="onSwipeStart" @pointermove="onSwipeMove" @pointerup="onSwipeEnd" @pointercancel="onSwipeCancel" @pointerleave="onSwipeEnd" @keydown="onSwipeKey"><span>→</span><span>{{tripActionLabel}}</span></div><small class="swipe-hint">{{tripActionHint}}</small></div>
  </div>
</template>

<style scoped>
.cockpit{max-width:600px;margin:auto;padding:20px 16px 142px;color:var(--kfe-ui-text);background:transparent}
.hero{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
.hero small,.section-heading small,.target-card small,.cockpit-target span{font-size:.62rem;font-weight:900;color:var(--kfe-muted-text);letter-spacing:.12em;text-transform:uppercase}
.hero h1{margin:3px 0 0;font-size:1.5rem;letter-spacing:-.03em}
.online-control{display:flex;align-items:center;gap:6px}.online-control span{font-size:.55rem;font-weight:900;color:var(--kfe-muted-text)}
.online-toggle{width:50px;height:30px;border:1px solid var(--kfe-ui-border);border-radius:999px;background:var(--kfe-ui-surface-2);padding:3px;cursor:pointer}
.online-toggle span{display:block;width:22px;height:22px;border-radius:50%;background:var(--kfe-ui-surface);box-shadow:0 1px 3px color-mix(in srgb,var(--kfe-ui-text) 20%,transparent);transition:transform .18s}
.online-toggle.active{background:var(--kfe-success);border-color:var(--kfe-success)}.online-toggle.active span{transform:translateX(20px)}
.card,.target-card{background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border);border-radius:var(--kfe-radius-lg,16px);padding:16px;margin-bottom:14px;box-shadow:var(--kfe-ui-shadow)}
.target-card{text-align:center;padding:14px 16px 12px}.target-card strong,.cockpit-target strong{display:block;margin-top:4px;font-size:1.4rem;font-variant-numeric:tabular-nums}
.state{display:flex;justify-content:space-between}.state div{display:flex;flex-direction:column;gap:3px}.state span,.muted{font-size:.75rem;color:var(--kfe-muted-text)}
.gate h2{margin:0 0 5px;font-size:1rem}.gate label{display:block;font-size:.76rem;font-weight:800;margin:12px 0}
.gate input,.gate select,.review input,.review select{width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--kfe-ui-border);border-radius:var(--kfe-radius-sm,8px);background:var(--kfe-ui-surface);color:var(--kfe-ui-text);margin-top:5px;font:inherit}
.secondary,.quiet,.primary,.danger{width:100%;min-height:44px;padding:10px 13px;border-radius:var(--kfe-radius-sm,10px);font-weight:900;margin-top:12px;cursor:pointer}
.secondary{background:var(--kfe-ui-surface);color:var(--kfe-ui-text);border:1px solid var(--kfe-ui-border)}.quiet{background:transparent;color:var(--kfe-muted-text);border:1px solid transparent}
.primary{background:var(--kfe-ui-accent);color:#fff;border:1px solid var(--kfe-ui-accent)}.danger{background:color-mix(in srgb,var(--kfe-danger) 12%,var(--kfe-ui-surface));color:var(--kfe-danger);border:1px solid color-mix(in srgb,var(--kfe-danger) 35%,var(--kfe-ui-border))}
.gap{background:color-mix(in srgb,var(--kfe-warning) 8%,var(--kfe-ui-surface));border:1px solid color-mix(in srgb,var(--kfe-warning) 35%,var(--kfe-ui-border));border-radius:var(--kfe-radius-md,12px);padding:12px}
.current-operator{display:flex;justify-content:space-between;padding:12px;background:var(--kfe-ui-surface-2);border-radius:var(--kfe-radius-md,12px)}
.operators{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.operators button,.allocation-actions button{min-height:44px;padding:11px;border:1px solid var(--kfe-ui-border);border-radius:var(--kfe-radius-sm,9px);background:var(--kfe-ui-surface);color:var(--kfe-ui-text);font-weight:800}
.operators button.selected,.allocation-actions button.selected{border:2px solid var(--kfe-ui-accent);background:color-mix(in srgb,var(--kfe-ui-accent) 8%,var(--kfe-ui-surface))}
.trip{text-align:center}.timer{font:700 2rem ui-monospace,SFMono-Regular,Menlo,monospace;margin:8px 0 14px;font-variant-numeric:tabular-nums}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.review{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px}.review input,.review select{font-size:.7rem;padding:9px}
.message,.error{padding:10px 12px;border-radius:var(--kfe-radius-sm,9px);margin-bottom:12px;font-size:.8rem}.message{background:color-mix(in srgb,var(--kfe-success) 11%,var(--kfe-ui-surface));color:var(--kfe-success)}.error{background:color-mix(in srgb,var(--kfe-danger) 11%,var(--kfe-ui-surface));color:var(--kfe-danger)}.error-text{color:var(--kfe-danger)}
.fuel-form{margin-top:8px}.calculated{display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--kfe-ui-surface-2);border-radius:var(--kfe-radius-md,10px);margin-top:12px;font-size:.75rem}.calculated strong{font-size:1rem;font-variant-numeric:tabular-nums}
.cancel-panel{margin-top:8px;text-align:left}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.section-heading h2{margin:2px 0 0;font-size:1rem}.optional-badge{font-size:.6rem;font-weight:900;color:var(--kfe-muted-text);background:var(--kfe-ui-surface-2);border:1px solid var(--kfe-ui-border);border-radius:999px;padding:5px 8px}
.location-row{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--kfe-ui-border)}.location-detail{min-width:0;display:flex;flex-direction:column;gap:2px}.location-detail strong{font-size:.78rem}.location-detail span{font-size:.8rem;font-weight:700;overflow-wrap:anywhere}.location-detail small{font-size:.67rem;color:var(--kfe-muted-text)}
.allocation-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.allocation-summary div{display:flex;flex-direction:column;gap:3px;padding:10px;background:var(--kfe-ui-surface);border:1px solid var(--kfe-ui-border);border-radius:var(--kfe-radius-sm,8px)}.allocation-summary span{font-size:.65rem;color:var(--kfe-muted-text)}.allocation-summary strong{font-size:1.1rem}
.allocation-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.action-reserve{height:64px}
.persistent-action{position:fixed;left:0;right:0;bottom:60px;height:64px;padding:5px 12px 4px;box-sizing:border-box;background:color-mix(in srgb,var(--kfe-ui-surface) 97%,transparent);border-top:1px solid var(--kfe-ui-border);z-index:9998;backdrop-filter:blur(10px)}
.swipe-bar{width:100%;height:42px;border-radius:var(--kfe-radius-md,12px);background:var(--kfe-ui-accent);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;user-select:none;touch-action:pan-y;transition:transform .16s;cursor:grab;box-shadow:0 4px 14px color-mix(in srgb,var(--kfe-ui-accent) 22%,transparent)}
.swipe-hint{display:block;text-align:center;color:var(--kfe-muted-text);font-size:.62rem;margin-top:2px}
@media(max-width:380px){.two,.review,.allocation-actions{grid-template-columns:1fr}}@media(min-width:900px){.cockpit{padding-top:24px}}
</style>