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
const operatorMenuOpen = ref(false)
const closingOdo = ref('')
const shiftRevenue = ref('')
const toll = ref('')
const parking = ref('')
const tollTreatment = ref('INCLUDED')
const reviewTrips = ref(false)
const cancelPanel = ref(false)
const cancelReason = ref('DRIVER_MISTAKE')
const cancelledRevenue = ref('')
const fuelFormOpen = ref(false)
const endShiftOpen = ref(false)
const endShiftStep = ref(1)
const fuelDraftKey = 'kfe.work.fuelDraft.v1'
const fuelDraftTtlMs = 30 * 60 * 1000
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
const swipeTrack = ref(null)
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
const locationPlace = location => location?.placeName || 'Resolving place…'
const locationTime = location => location?.capturedAt ? new Date(location.capturedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}) : 'Time unavailable'
const notify = text => { message.value = text; error.value = ''; window.setTimeout(() => { if (message.value === text) message.value = '' }, 2200) }
const fail = text => { error.value = text; message.value = '' }
const refreshTarget = async () => { try { target.value = await DriverTargetService.getTarget(getKfeReferenceNow()) } catch (_) { target.value = null } }
const selectGapCategory = category => { if (!gap.value.valid || gapKm.value <= 0) return; gapCategory.value = category; gapConfirmed.value = false; if (category !== 'PERSONAL') { personalToll.value = ''; personalParking.value = '' } }
const confirmGapAllocation = () => { if (!gap.value.valid || gapKm.value <= 0 || !gapCategory.value) return fail('Choose Personal KM or Dead KM before confirming the odometer gap.'); gapConfirmed.value = true; notify('Odometer allocation confirmed.') }
const goOnline = async () => { const needsGap = gap.value.valid && gapKm.value > 0; if (needsGap && !gapConfirmed.value) return fail('Confirm the full odometer gap allocation before going Online.'); const result = await store.startShift(startOdo.value, needsGap ? { category: gapCategory.value, personalToll: personalToll.value, personalParking: personalParking.value } : null); if (result.requiresGapAllocation) return fail(`Choose Personal KM or Dead KM to allocate the full ${result.gapKm} km before going Online.`); if (!result.ok) return fail(result.reason); startOdo.value=''; gapCategory.value=null; gapConfirmed.value=false; personalToll.value=''; personalParking.value=''; await refreshTarget(); notify('Online.') }
const goOffline = async (confirmLargeDistance = false) => { const trips = reviewTrips.value ? store.completedTrips.map(t => ({ id:t.id, operator:t.operator, tripKm:t.tripKm??'', revenue:t.revenue??'' })) : []; const result = await store.endShift({ closingOdometer:closingOdo.value, revenue:shiftRevenue.value, toll:toll.value, parking:parking.value, tollParkingRevenueTreatment:tollTreatment.value, trips, confirmLargeDistance }); if(result.requiresConfirmation){ const confirmed=window.confirm(`⚠️ Closing odometer shows ${result.distanceKm} km for this shift. If the odometer is correct, confirm to end the Shift.`); if(!confirmed)return; return goOffline(true) } if(!result.ok)return fail(result.reason); clearEndShiftFlow(); await refreshTarget(); notify('Offline.') }
const clearEndShiftFlow = () => { closingOdo.value=''; shiftRevenue.value=''; toll.value=''; parking.value=''; tollTreatment.value='INCLUDED'; reviewTrips.value=false; endShiftStep.value=1; endShiftOpen.value=false }
const openEndShift = () => { fuelFormOpen.value=false; endShiftStep.value=1; endShiftOpen.value=true; error.value=''; message.value='' }
const endShiftBack = () => { if(endShiftStep.value<=1) return cancelOffline(); endShiftStep.value -= 1; error.value=''; message.value='' }
const endShiftContinue = () => { if(!closingOdo.value || !shiftRevenue.value) return fail('Closing odometer and total shift revenue are required.'); endShiftStep.value=2; error.value=''; message.value='' }
const endShiftExpenseSave = () => { endShiftStep.value=3; error.value=''; message.value='' }
const endShiftExpenseSkip = () => { toll.value=''; parking.value=''; endShiftStep.value=3; error.value=''; message.value='' }
const endShiftReviewSave = async () => { reviewTrips.value=true; await goOffline() }
const endShiftReviewSkip = async () => { reviewTrips.value=false; await goOffline() }
const toggleOnline = async () => { if(store.isTripActive)return fail('End the active Trip before going Offline.'); if(store.isOnline){ openEndShift(); return } return goOnline() }
const cancelOffline = () => { endShiftOpen.value = false; endShiftStep.value=1; error.value = ''; notify('Still Online — End Shift cancelled.') }
const saveFuelDraft = () => { const draft={savedAt:Date.now(),odometer:fuelOdometer.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value}; if(draft.odometer||draft.pricePerKg||draft.amount) sessionStorage.setItem(fuelDraftKey,JSON.stringify(draft)); else sessionStorage.removeItem(fuelDraftKey) }
const loadFuelDraft = () => { try { const draft=JSON.parse(sessionStorage.getItem(fuelDraftKey)||'null'); if(!draft || Date.now()-Number(draft.savedAt||0)>fuelDraftTtlMs){sessionStorage.removeItem(fuelDraftKey);return} fuelOdometer.value=draft.odometer||''; fuelPrice.value=draft.pricePerKg||''; fuelAmount.value=draft.amount||'' } catch(_) {} }
const openFuelForm = () => { fuelFormOpen.value = !fuelFormOpen.value; if (fuelFormOpen.value) { endShiftOpen.value=false; loadFuelDraft() } else saveFuelDraft(); error.value=''; message.value='' }
const closeFuelForm = () => { saveFuelDraft(); fuelFormOpen.value=false; error.value=''; message.value='' }
const changeTripOperator = async operator => { if(!store.isTripActive){selectedOperator.value=operator;operatorMenuOpen.value=false;return} if(operator===store.trip.operator){operatorMenuOpen.value=false;return} const result=await store.updateTrip({id:store.trip.id,operator}); if(!result.ok)return fail(result.reason); selectedOperator.value=operator; operatorMenuOpen.value=false; notify(`Operator changed to ${operator}.`) }
const startTrip = async () => { const result=await store.startTrip(selectedOperator.value||store.defaultOperator); if(!result.ok)return fail(result.reason); selectedOperator.value=result.trip.operator; notify('Trip started.') }
const endTrip = async () => { if(await store.endTrip()){ await refreshTarget(); notify('Trip completed.') } }
const cancelAccidentalTrip = async () => { if(!confirm('Cancel this accidental trip? It will be recorded as a cancelled driver-mistake trip.'))return; if(await store.cancelTrip({reason:'DRIVER_MISTAKE'})){await refreshTarget();notify('Accidental trip cancelled.')} }
const cancelTripWithRevenue = async () => { if(!confirm('Record this trip as cancelled? Optional revenue will be retained if entered.'))return; if(await store.cancelTrip({reason:cancelReason.value,revenue:cancelledRevenue.value})){cancelledRevenue.value='';cancelPanel.value=false;await refreshTarget();notify('Cancelled trip recorded.')} }
const saveFuel = async () => { const result=await fuelStore.save({odometer:fuelOdometer.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value}); if(!result.ok)return fail(result.reason); fuelOdometer.value='';fuelPrice.value='';fuelAmount.value='';sessionStorage.removeItem(fuelDraftKey);fuelFormOpen.value=false;notify(`Refuelling recorded: ${result.record.quantityKg.toFixed(2)} kg.`) }
const primaryTripAction = () => store.isTripActive ? endTrip() : startTrip()
const tripActionLabel = computed(() => store.isTripActive ? 'SWIPE → END TRIP' : 'SWIPE → START TRIP')
const tripActionHint = computed(() => store.isTripActive ? 'Swipe from left to right to end this trip' : 'Swipe from left to right to start this trip')
const swipeProgress = computed(() => {
  const width = swipeTrack.value?.clientWidth || 320
  return Math.min(100, Math.round((swipeOffset.value / Math.max(1, width)) * 100))
})
const swipeStyle = computed(() => ({
  '--swipe-progress': `${swipeProgress.value}%`,
  '--swipe-offset': `${swipeOffset.value}px`
}))
const onSwipeStart = event => { if(event.pointerType==='mouse'&&event.button!==0)return; swipeStartX.value=event.clientX;swipeTracking.value=true;swipeOffset.value=0;event.currentTarget.setPointerCapture?.(event.pointerId) }
const onSwipeMove = event => { if(!swipeTracking.value||swipeStartX.value==null)return; const width=swipeTrack.value?.clientWidth||320; const max=Math.max(80,width-56); swipeOffset.value=Math.max(0,Math.min(event.clientX-swipeStartX.value,max)) }
const onSwipeEnd = async event => { if(!swipeTracking.value||swipeStartX.value==null)return; const distance=event.clientX-swipeStartX.value; const width=swipeTrack.value?.clientWidth||320; const trigger=width*0.8; swipeTracking.value=false;swipeStartX.value=null;swipeOffset.value=0;if(distance>=trigger)await primaryTripAction() }
const onSwipeCancel = () => { swipeTracking.value=false;swipeStartX.value=null;swipeOffset.value=0 }
const onSwipeKey = async event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();await primaryTripAction()} }
onMounted(async()=>{await store.initialize();await fuelStore.refresh();await refreshTarget();startOdo.value=store.lastKnownOdometer??'';selectedOperator.value=store.defaultOperator;loadFuelDraft();unsubscribeTarget=DriverTargetService.subscribeDataChanges(()=>{void refreshTarget()});interval=window.setInterval(()=>{clock.value=Date.now()},1000)})
onUnmounted(()=>{window.clearInterval(interval);unsubscribeTarget?.()})
</script>

<template>
  <div class="cockpit kfe-work-cockpit" :class="{ 'cockpit--offline': !store.isOnline, 'cockpit--online': store.isOnline && !store.isTripActive && !endShiftOpen, 'cockpit--trip': store.isTripActive, 'cockpit--end-shift': endShiftOpen, 'cockpit--fuel': fuelFormOpen }">
    <header class="hero">
      <div><small>KFE WORK</small><h1>Driver Cockpit</h1></div>
      <div class="hero-actions"><button class="fuel-icon" type="button" :class="{active:fuelFormOpen}" aria-label="CNG refuelling" title="CNG refuelling" @click="openFuelForm"><span aria-hidden="true">⛽</span></button><div class="online-control"><span>OFFLINE</span><button type="button" class="online-toggle" :class="{active:store.isOnline}" :disabled="store.isTripActive" role="switch" :aria-checked="store.isOnline" :aria-label="store.isOnline ? 'Go Offline' : 'Go Online'" @click.stop.prevent="toggleOnline"><span/></button><span>ONLINE</span></div></div>
    </header>
    <div v-if="message" class="message">{{message}}</div><div v-if="error" class="error">{{error}}</div>

    <section v-if="fuelFormOpen" class="card gate cockpit-form-surface">
      <div class="form-topline"><div><small>CNG REFUELLING</small><h2>Refuelling</h2></div><button class="form-back" type="button" @click="closeFuelForm"><span aria-hidden="true">🔙</span><span>Back</span></button></div>
      <div class="form-body">
        <label>Odometer (km)<input v-model="fuelOdometer" type="number" min="0" inputmode="decimal"></label>
        <label>Price per kg (₹)<input v-model="fuelPrice" type="number" min="0" step="0.01" inputmode="decimal"></label>
        <label>Amount (₹)<input v-model="fuelAmount" type="number" min="0" step="0.01" inputmode="decimal"></label>
        <div class="calculated"><span>ERP-calculated quantity</span><strong>{{fuelQuantity.toFixed(2)}} kg</strong></div>
      </div>
      <div class="form-actions"><button class="secondary" type="button" @click="closeFuelForm">Keep Draft &amp; Close</button><button class="primary" :disabled="fuelStore.saving" @click="saveFuel">{{fuelStore.saving?'Saving…':'SAVE FUEL'}}</button></div>
    </section>

    <section v-else-if="!store.isTripActive && !store.isOnline" class="cockpit-state cockpit-start-state">
      <div class="state-kicker">OFFLINE</div>
      <h2>START SHIFT</h2>
      <div class="focus-card">
        <label>Start odometer</label><input v-model="startOdo" type="number" min="0" inputmode="decimal" aria-label="Start odometer">
        <span class="field-note">Pre-filled from last valid entry</span>
      </div>
      <div v-if="store.firstKfeDay && gap.valid" class="gap compact-gap"><div class="gap-head"><strong>Historical odometer gap</strong><span>Excluded from Personal / Dead KM</span></div><div class="allocation-summary"><div><span>Business start</span><strong>{{store.businessStartBaseline?.businessStartOdometer ?? '—'}} km</strong></div><div><span>Current</span><strong>{{startOdo || '—'}} km</strong></div></div></div>
      <div v-else-if="gap.valid&&gapKm>0" class="gap compact-gap"><div class="gap-head"><strong>Odometer gap · {{gapKm}} km</strong><span>Resolve before Online</span></div><div class="allocation-actions"><button type="button" :class="{selected:gapCategory==='PERSONAL'}" @click="selectGapCategory('PERSONAL')">Personal KM</button><button type="button" :class="{selected:gapCategory==='DEAD'}" @click="selectGapCategory('DEAD')">Dead KM</button></div><div class="gap-status"><span v-if="gapCategory">Allocated {{allocatedGap}} / {{gapKm}} km</span><span v-else>Choose one category.</span><button v-if="gapCategory && !gapConfirmed" class="primary" type="button" @click="confirmGapAllocation">CONFIRM GAP</button><span v-else-if="gapConfirmed" class="confirmed-text">✓ Gap confirmed</span></div></div>
      <div class="next-event"><span>NEXT</span><strong>GO ONLINE</strong></div>
    </section>

    <section v-else-if="!store.isTripActive && store.isOnline && !endShiftOpen" class="cockpit-state cockpit-ready-state">
      <div class="state-kicker online">ONLINE</div>
      <h2>READY FOR NEXT TRIP</h2>
      <div class="ready-context"><div class="operator-inline"><span>Operator</span><button type="button" class="operator-select" @click="operatorMenuOpen=!operatorMenuOpen">{{(selectedOperator||store.defaultOperator)+' ▾'}}</button></div><div v-if="operatorMenuOpen" class="operator-menu"><button v-for="operator in store.operators" :key="operator" type="button" :class="{selected:(store.defaultOperator===operator&&selectedOperator!=='__menu__')}" @click="changeTripOperator(operator)">{{operator}}</button></div></div>
      <div class="target-inline"><span>TODAY'S TARGET</span><strong>{{targetText}}</strong></div>
      <div class="next-event"><span>NEXT</span><strong>START TRIP</strong></div>
    </section>

    <section v-if="store.isTripActive && !endShiftOpen" class="cockpit-state cockpit-trip-state">
      <div class="state-kicker online">ON TRIP</div>
      <div class="trip-operator-row"><span>Operator</span><button type="button" class="operator-select" @click="selectedOperator = selectedOperator === '__menu__' ? store.trip.operator : '__menu__'">{{store.trip.operator+' ▾'}}</button></div>
      <div v-if="selectedOperator==='__menu__'" class="operator-menu"><button v-for="operator in store.operators" :key="operator" type="button" :class="{selected:store.trip.operator===operator}" @click="changeTripOperator(operator)">{{operator}}</button></div>
      <div class="trip-core"><div class="timer">{{tripTimer}}</div><div class="trip-continuity">Trip in progress · operator can be corrected before trip ends</div></div>
      <div class="next-event"><span>NEXT</span><strong>END TRIP</strong></div>
    </section>

    <section v-if="endShiftOpen" class="cockpit-state cockpit-end-state">
      <div class="form-topline"><div><div class="state-kicker">GOING OFFLINE</div><h2>{{endShiftStep===1?'CLOSE SHIFT':endShiftStep===2?'SHIFT EXPENSES':'RIDE REVIEW'}}</h2></div><button class="form-back" type="button" @click="endShiftBack"><span aria-hidden="true">🔙</span><span>Back</span></button></div>

      <div v-if="endShiftStep===1" class="end-form-body">
        <div class="start-odo-reference"><span>Shift started</span><strong>{{store.startOdometer ?? '—'}} km</strong></div>
        <label>Closing odometer (km)<input v-model="closingOdo" type="number" min="0" inputmode="decimal" autofocus></label>
        <label>Total shift revenue (₹)<input v-model="shiftRevenue" type="number" min="0" step="0.01" placeholder="Enter total shift revenue" inputmode="decimal"></label>
      </div>

      <div v-else-if="endShiftStep===2" class="end-form-body">
        <p class="form-question">SHIFT EXPENSES</p>
        <p class="muted">Enter any toll or parking paid during this shift.</p>
        <label>Toll<input v-model="toll" type="number" min="0" step="0.01" inputmode="decimal" placeholder="₹ 0"></label>
        <label>Parking<input v-model="parking" type="number" min="0" step="0.01" inputmode="decimal" placeholder="₹ 0"></label>
        <label class="exclude-check"><input v-model="tollTreatment" true-value="EXCLUDED" false-value="INCLUDED" type="checkbox"><span>Exclude toll &amp; parking from trip fare</span></label>
      </div>

      <div v-else class="end-form-body">
        <p class="form-question">REVIEW RIDES</p>
        <p class="muted">Optional. Correct any ride details before ending the shift.</p>
        <div class="reviews compact-reviews"><p v-if="!store.completedTrips.length" class="muted">No completed trips.</p><div v-for="t in store.completedTrips" :key="t.id" class="review"><select v-model="t.operator" aria-label="Trip operator"><option v-for="operator in store.operators" :key="operator">{{operator}}</option></select><input v-model="t.tripKm" type="number" min="0" step="0.1" placeholder="KM"><input v-model="t.revenue" type="number" min="0" step="0.01" placeholder="₹"></div></div>
      </div>

      <div class="form-actions end-actions">
        <template v-if="endShiftStep===1"><button class="primary" type="button" @click="endShiftContinue">CONTINUE →</button></template>
        <template v-else-if="endShiftStep===2"><button class="secondary" type="button" @click="endShiftExpenseSave">SAVE</button><button class="primary skip-dominant" type="button" @click="endShiftExpenseSkip">SKIP →</button></template>
        <template v-else><button class="secondary" type="button" @click="endShiftReviewSave">SAVE &amp; END SHIFT</button><button class="primary skip-dominant" type="button" @click="endShiftReviewSkip">SKIP &amp; END SHIFT →</button></template>
      </div>
    </section>

    <div v-if="store.isOnline && !endShiftOpen && !fuelFormOpen" class="persistent-action">
      <div ref="swipeTrack" class="swipe-bar trip-action" :class="{ 'swipe-bar--start': !store.isTripActive, 'swipe-bar--end': store.isTripActive, 'is-swiping': swipeTracking, 'is-threshold': swipeProgress >= 80 }" :style="swipeStyle" role="button" tabindex="0" aria-label="Swipe from left to right to start or end the current trip" @pointerdown="onSwipeStart" @pointermove="onSwipeMove" @pointerup="onSwipeEnd" @pointercancel="onSwipeCancel" @pointerleave="onSwipeEnd" @keydown="onSwipeKey">
        <span class="swipe-progress" aria-hidden="true"></span><span class="swipe-threshold" aria-hidden="true"><i></i><em>80%</em></span><span class="swipe-label">{{tripActionLabel}}</span><span class="swipe-thumb" aria-hidden="true"><b>→</b></span>
      </div><small class="swipe-hint">{{swipeTracking ? (swipeProgress >= 80 ? 'RELEASE TO CONFIRM' : 'KEEP SWIPING →') : tripActionHint}}</small>
    </div>
  </div>
</template>