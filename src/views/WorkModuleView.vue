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
const endShiftOpen = ref(false)
const gapConfirmed = ref(false)
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
const selectGapCategory = category => { if (!gap.value.valid || gapKm.value <= 0) return; gapCategory.value = category; gapConfirmed.value = false; if (category !== 'PERSONAL') { personalToll.value = ''; personalParking.value = '' } }
const confirmGapAllocation = () => { if (!gap.value.valid || gapKm.value <= 0 || !gapCategory.value) return fail('Choose Personal KM or Dead KM before confirming the odometer gap.'); gapConfirmed.value = true; notify('Odometer allocation confirmed.') }
const goOnline = async () => { const needsGap = gap.value.valid && gapKm.value > 0; if (needsGap && !gapConfirmed.value) return fail('Confirm the full odometer gap allocation before going Online.'); const result = await store.startShift(startOdo.value, needsGap ? { category: gapCategory.value, personalToll: personalToll.value, personalParking: personalParking.value } : null); if (result.requiresGapAllocation) return fail(`Choose Personal KM or Dead KM to allocate the full ${result.gapKm} km before going Online.`); if (!result.ok) return fail(result.reason); startOdo.value=''; gapCategory.value=null; gapConfirmed.value=false; personalToll.value=''; personalParking.value=''; await refreshTarget(); notify('Online.') }
const goOffline = async (confirmLargeDistance = false) => { const trips = reviewTrips.value ? store.completedTrips.map(t => ({ id:t.id, operator:t.operator, tripKm:t.tripKm??'', revenue:t.revenue??'' })) : []; const result = await store.endShift({ closingOdometer:closingOdo.value, revenue:shiftRevenue.value, toll:toll.value, parking:parking.value, tollParkingRevenueTreatment:tollTreatment.value, trips, confirmLargeDistance }); if(result.requiresConfirmation){ const confirmed=window.confirm(`⚠️ Closing odometer shows ${result.distanceKm} km for this shift. This is above the 500 km/day safety threshold. If the odometer is correct, confirm to end the Shift.`); if(!confirmed)return; return goOffline(true) } if(!result.ok)return fail(result.reason); closingOdo.value=''; shiftRevenue.value=''; toll.value=''; parking.value=''; tollTreatment.value='NONE'; reviewTrips.value=false; endShiftOpen.value=false; await refreshTarget(); notify('Offline.') }
const toggleOnline = async () => { if(store.isTripActive)return fail('End the active Trip before going Offline.'); if(store.isOnline){ fuelFormOpen.value=false; endShiftOpen.value=true; return } return goOnline() }
const cancelOffline = () => { endShiftOpen.value=false; error.value=''; message.value=''; }
const openFuelForm = () => { fuelFormOpen.value = !fuelFormOpen.value; error.value=''; message.value='' }
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
    <header class="hero"><div><small>KFE WORK</small><h1>Driver Cockpit</h1></div><div class="hero-actions"><button class="fuel-icon" type="button" :class="{active:fuelFormOpen}" aria-label="CNG refuelling" title="CNG refuelling" @click="openFuelForm"><span aria-hidden="true">⛽</span></button><div class="online-control"><span>OFFLINE</span><button class="online-toggle" :class="{active:store.isOnline}" :disabled="store.isTripActive" role="switch" :aria-checked="store.isOnline" :aria-label="store.isOnline ? 'Go Offline' : 'Go Online'" @click="toggleOnline"><span/></button><span>ONLINE</span></div></div></header>
    <div v-if="message" class="message">{{message}}</div><div v-if="error" class="error">{{error}}</div>
    <section v-if="fuelFormOpen" class="card gate fuel-form-card"><div class="section-heading"><div><small>CNG REFUELLING</small><h2>Refuelling</h2></div><span class="optional-badge">Anytime</span></div><p class="muted">ERP calculates quantity from amount ÷ price per kg. GPS and timestamp are captured automatically when available.</p><label>Odometer (km)<input v-model="fuelOdometer" type="number" min="0" inputmode="decimal"></label><label>Price per kg (₹)<input v-model="fuelPrice" type="number" min="0" step="0.01" inputmode="decimal"></label><label>Amount (₹)<input v-model="fuelAmount" type="number" min="0" step="0.01" inputmode="decimal"></label><div class="calculated"><span>ERP-calculated quantity</span><strong>{{fuelQuantity.toFixed(2)}} kg</strong></div><button class="primary" :disabled="fuelStore.saving" @click="saveFuel">{{fuelStore.saving?'Saving…':'Save refuelling'}}</button></section>
    <section v-if="!store.isTripActive && !store.isOnline" class="card gate"><h2>Start Shift</h2><p class="muted">The Online toggle opens this gate. The shift starts only after the odometer check succeeds.</p><label>Current odometer (km)<input v-model="startOdo" type="number" min="0" inputmode="decimal"></label><div v-if="gap.valid&&gapKm>0" class="gap"><strong>Odometer gap: {{gapKm}} km</strong><p>ERP calculates the gap. Choose one category and the entire gap is assigned to it.</p><div class="allocation-summary"><div><span>Personal KM</span><strong>{{gapPersonal}}</strong></div><div><span>Dead KM</span><strong>{{gapDead}}</strong></div></div><div class="allocation-actions"><button type="button" :class="{selected:gapCategory==='PERSONAL'}" @click="selectGapCategory('PERSONAL')">Personal KM · {{gapKm}} km</button><button type="button" :class="{selected:gapCategory==='DEAD'}" @click="selectGapCategory('DEAD')">Dead KM · {{gapKm}} km</button></div><small v-if="gapCategory">Allocated {{allocatedGap}} / {{gapKm}} km to {{gapCategory==='PERSONAL'?'Personal KM':'Dead KM'}}.</small><button v-if="gapCategory && !gapConfirmed" class="primary gap-confirm" type="button" @click="confirmGapAllocation">OK — Confirm allocation</button><small v-else-if="gapConfirmed" class="confirmed-text">✓ Allocation confirmed. Press ONLINE to start the shift.</small><small v-else>Choose Personal KM or Dead KM to continue.</small><div v-if="gapCategory==='PERSONAL'" class="two"><label>Personal toll (optional)<input v-model="personalToll" type="number" min="0" step="0.01"></label><label>Personal parking (optional)<input v-model="personalParking" type="number" min="0" step="0.01"></label></div></div><p v-else-if="gap.valid" class="muted">No odometer gap.</p><p v-else-if="startOdo" class="error-text">{{gap.reason}}</p></section>
    <section v-else-if="!store.isTripActive && store.isOnline && !endShiftOpen" class="card gate"><h2>Start Trip</h2><div class="current-operator"><span>Operator for this trip</span><strong>{{selectedOperator||store.defaultOperator}}</strong></div><p class="muted">Check this before every ride. The selected operator carries forward until changed.</p><div class="operators"><button v-for="operator in store.operators" :key="operator" :class="{selected:(selectedOperator||store.defaultOperator)===operator}" @click="selectedOperator=operator">{{operator}}</button></div></section>
    <section v-if="store.isTripActive" class="card trip"><small>TRIP ACTIVE</small><h2>{{store.trip.operator}}</h2><div class="cockpit-target"><span>TODAY'S TARGET</span><strong>{{targetText}}</strong></div><div class="timer">{{tripTimer}}</div><button class="quiet" @click="cancelAccidentalTrip">Cancel accidental trip</button><button class="secondary" @click="cancelPanel=!cancelPanel">Record cancelled trip / revenue</button><div v-if="cancelPanel" class="cancel-panel"><label>Cancellation reason<select v-model="cancelReason"><option value="DRIVER_MISTAKE">Driver mistake</option><option value="OPERATOR_CANCELLED">Operator cancelled</option><option value="CUSTOMER_CANCELLED">Customer cancelled</option></select></label><label>Revenue if applicable (optional)<input v-model="cancelledRevenue" type="number" min="0" step="0.01"></label><button class="danger" @click="cancelTripWithRevenue">Record cancellation</button></div></section>
    <section v-if="!store.isTripActive" class="target-card"><small>TODAY'S TARGET</small><strong>{{targetText}}</strong></section>
    <section v-if="store.lifecycleLocations.length && !endShiftOpen" class="card locations"><div class="section-heading"><div><small>SHIFT GPS</small><h2>Location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.lifecycleLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{locationEventLabel(location.eventType)}}</strong><span>{{locationPlace(location)}}</span><small>{{locationTime(location)}}</small></div></div></section>
    <section v-if="store.tripLocations.length && !endShiftOpen" class="card locations"><div class="section-heading"><div><small>TRIP GPS</small><h2>Trip location events</h2></div><span class="optional-badge">Optional</span></div><div v-for="location in store.tripLocations.slice().reverse()" :key="location.id" class="location-row"><div class="pin">⌖</div><div class="location-detail"><strong>{{locationEventLabel(location.eventType)}}</strong><span>{{locationPlace(location)}}</span><small>{{locationTime(location)}}</small></div></div></section>
    <section v-if="store.isOnline&&!store.isTripActive&&endShiftOpen" class="card gate end-shift-card"><div class="section-heading"><div><small>GOING OFFLINE</small><h2>End Shift</h2></div><button class="secondary back-button" type="button" @click="cancelOffline">Back</button></div><p class="muted">Closing odometer and total shift revenue are required. Trip fares are supporting detail only.</p><div class="start-odo-reference"><span>Shift start odometer</span><strong>{{store.startOdometer ?? '—'}} km</strong></div><label>Closing odometer (km)<input v-model="closingOdo" type="number" min="0" inputmode="decimal"></label><label>Total shift revenue (₹)<input v-model="shiftRevenue" type="number" min="0" step="0.01" placeholder="Enter total shift revenue" inputmode="decimal"></label><div class="two"><label>Business toll (optional)<input v-model="toll" type="number" min="0" step="0.01"></label><label>Business parking (optional)<input v-model="parking" type="number" min="0" step="0.01"></label></div><label v-if="Number(toll||0)>0||Number(parking||0)>0">Business toll/parking treatment<select v-model="tollTreatment"><option value="NONE">None</option><option value="INCLUDED">Included in revenue/fare</option><option value="EXCLUDED">Excluded from revenue/fare</option></select></label><button class="secondary" @click="reviewTrips=!reviewTrips">{{reviewTrips?'Hide optional trip review':'Optional trip review / correction'}}</button><div v-if="reviewTrips" class="reviews"><p v-if="!store.completedTrips.length" class="muted">No completed trips.</p><div v-for="t in store.completedTrips" :key="t.id" class="review"><select v-model="t.operator"><option v-for="operator in store.operators" :key="operator">{{operator}}</option></select><input v-model="t.tripKm" type="number" min="0" step="0.1" placeholder="KM optional"><input v-model="t.revenue" type="number" min="0" step="0.01" placeholder="₹ optional"></div></div><button class="primary" @click="goOffline()">OK — End Shift</button></section>
    <div v-if="store.isOnline" class="action-reserve"></div><div v-if="store.isOnline" class="persistent-action"><div class="swipe-bar trip-action" :style="swipeStyle" role="button" tabindex="0" aria-label="Swipe from left to right to start or end the current trip" @pointerdown="onSwipeStart" @pointermove="onSwipeMove" @pointerup="onSwipeEnd" @pointercancel="onSwipeCancel" @pointerleave="onSwipeEnd" @keydown="onSwipeKey"><span>→</span><span>{{tripActionLabel}}</span></div><small class="swipe-hint">{{tripActionHint}}</small></div>
  </div>
</template>

