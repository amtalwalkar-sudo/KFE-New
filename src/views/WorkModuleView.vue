<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useShiftTripStore } from '../stores/shiftTrip.js'
import { useFuelStore } from '../stores/fuel.js'
import { DriverTargetService } from '../application/performance/driverTargetService.js'
import { PerformanceService } from '../application/performance/performanceService.js'
import { getKfeReferenceNow, reportingRangeFor, istCalendarDaysInclusive, istParts } from '../domain/time/ist.js'
import { DeadKmPickupGpsService } from '../services/deadKmPickupGpsService.js'

const store = useShiftTripStore()
const fuelStore = useFuelStore()
const startOdo = ref('')
const startOdoOpen = ref(false)
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
const endShiftSaved = ref({ 1: false, 2: false, 3: false })
const endShiftSwipeStartX = ref(null)
const endShiftSwipeTracking = ref(false)
const endShiftSwipeOffset = ref(0)
const endShiftActiveField = ref(null)
const endShiftKeypadVisible = ref(false)
const fuelDraftKey = 'kfe.work.fuelDraft.v1'
const fuelDraftTtlMs = 30 * 60 * 1000
const fuelOdometer = ref('')
const fuelPrice = ref('')
const fuelAmount = ref('')
const fuelClientMutationId = ref('')
const message = ref('')
const error = ref('')
const target = ref(null)
const clock = ref(Date.now())
const swipeStartX = ref(null)
const swipeTracking = ref(false)
const swipeOffset = ref(0)
const swipeTrack = ref(null)
const goingToPickup = ref(false)
const pickupGpsPoints = ref(0)
const pickupGpsSummary = ref({ points: 0, nearTwoSecondIntervals: 0, maxGapMs: 0, passed: false })
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
const performanceSnapshot = ref(null)
const performanceMoney = value => Number.isFinite(Number(value)) ? `₹${Math.round(Number(value)).toLocaleString('en-IN')}` : '—'
const performanceRevenue = metrics => Number(metrics?.revenue || 0) + Number(metrics?.toll || 0) + Number(metrics?.parking || 0)
const performanceBreakEven = (metrics, range) => {
  const monthly = Number(metrics?.monthlyBreakEvenRevenue)
  if (!Number.isFinite(monthly) || !range?.from || !range?.to) return 0
  const monthDays = new Date(Date.UTC(istParts(range.to).year, istParts(range.to).month, 0)).getUTCDate()
  const periodDays = istCalendarDaysInclusive(range.from, range.to)
  return monthly * Math.max(0, Math.min(monthDays, periodDays)) / monthDays
}
const buildPerformanceCard = (metrics, range, label) => {
  const revenue = performanceRevenue(metrics)
  const breakEven = performanceBreakEven(metrics, range)
  return { date: label, revenue, profit: revenue - breakEven }
}
const weeklyPerformance = ref(null)
const yesterdayPerformance = ref(null)
const refreshPerformance = async () => {
  try {
    const now = getKfeReferenceNow()
    const snapshot = await PerformanceService.getSnapshot()
    performanceSnapshot.value = snapshot
    const weekRange = reportingRangeFor('WEEK', now)
    const yesterdayDate = new Date(istDayRange(now).from.getTime() - 86400000)
    const yesterdayRange = reportingRangeFor('DAY', yesterdayDate)
    const weekMetrics = PerformanceService.getMetrics(snapshot, weekRange)
    const yesterdayMetrics = PerformanceService.getMetrics(snapshot, yesterdayRange)
    const weekParts = istParts(weekRange.to)
    const yesterdayParts = istParts(yesterdayRange.from)
    const weekStart = istParts(weekRange.from)
    weeklyPerformance.value = buildPerformanceCard(weekMetrics, weekRange, `${weekStart.day}/${weekStart.month} – ${weekParts.day}/${weekParts.month}/${weekParts.year}`)
    yesterdayPerformance.value = buildPerformanceCard(yesterdayMetrics, yesterdayRange, `${yesterdayParts.day}/${yesterdayParts.month}/${yesterdayParts.year}`)
  } catch (_) {
    weeklyPerformance.value = null
    yesterdayPerformance.value = null
  }
}
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
const selectGapCategory = category => { if (!gap.value.valid || gapKm.value <= 0) return; gapCategory.value = category; if (category !== 'PERSONAL') { personalToll.value = ''; personalParking.value = '' } }
const goOnline = async () => { const needsGap = gap.value.valid && gapKm.value > 0; if (!startOdo.value) return fail('Enter the start odometer before going Online.'); if (needsGap && !gapCategory.value) return fail('Choose Personal KM or Dead KM before going Online.'); const allocation = needsGap ? { category: gapCategory.value, personalToll: personalToll.value, personalParking: personalParking.value } : null; const result = await store.startShift(startOdo.value, allocation); if (result.requiresGapAllocation) return fail(`Choose Personal KM or Dead KM to allocate the full ${result.gapKm} km before going Online.`); if (!result.ok) return fail(result.reason); startOdo.value=''; gapCategory.value=null; personalToll.value=''; personalParking.value=''; startOdoOpen.value=false; await refreshTarget(); notify('Online.') }
const goOffline = async (confirmLargeDistance = false) => { const trips = reviewTrips.value ? store.completedTrips.map(t => ({ id:t.id, operator:t.operator, tripKm:t.tripKm??'', revenue:t.revenue??'' })) : []; const result = await store.endShift({ closingOdometer:closingOdo.value, revenue:shiftRevenue.value, toll:toll.value, parking:parking.value, tollParkingRevenueTreatment:tollTreatment.value, trips, confirmLargeDistance }); if(result.requiresConfirmation){ const confirmed=window.confirm(`⚠️ Closing odometer shows ${result.distanceKm} km for this shift. If the odometer is correct, confirm to end the Shift.`); if(!confirmed)return; return goOffline(true) } if(!result.ok)return fail(result.reason); clearEndShiftFlow(); await refreshTarget(); notify('Offline.') }
const clearEndShiftFlow = () => { closingOdo.value=''; shiftRevenue.value=''; toll.value=''; parking.value=''; tollTreatment.value='INCLUDED'; reviewTrips.value=false; endShiftStep.value=1; endShiftSaved.value={1:false,2:false,3:false}; endShiftSwipeStartX.value=null; endShiftSwipeTracking.value=false; endShiftSwipeOffset.value=0; endShiftActiveField.value=null; endShiftKeypadVisible.value=false; endShiftOpen.value=false }
const openEndShift = () => { fuelFormOpen.value=false; endShiftStep.value=1; endShiftSaved.value={1:false,2:false,3:false}; endShiftSwipeStartX.value=null; endShiftSwipeTracking.value=false; endShiftSwipeOffset.value=0; endShiftActiveField.value=null; endShiftKeypadVisible.value=false; endShiftOpen.value=true; error.value=''; message.value='' }
const endShiftBack = () => { if(endShiftStep.value<=1) return cancelOffline(); endShiftStep.value -= 1; error.value=''; message.value='' }
const endShiftContinue = () => { if(!closingOdo.value || !shiftRevenue.value) return fail('Closing odometer and total shift revenue are required.'); endShiftSaved.value={...endShiftSaved.value,1:true}; endShiftStep.value=2; error.value=''; message.value='' }
const endShiftExpenseSave = () => { endShiftSaved.value={...endShiftSaved.value,2:true}; endShiftStep.value=3; error.value=''; message.value='' }
const endShiftExpenseSkip = () => { toll.value=''; parking.value=''; endShiftSaved.value={...endShiftSaved.value,2:true}; endShiftStep.value=3; error.value=''; message.value='' }
const endShiftReviewSave = async () => { for (const t of store.completedTrips) { const result=await store.updateTrip({id:t.id,operator:t.operator,tripKm:t.tripKm??'',revenue:t.revenue??''}); if(!result.ok)return fail(result.reason) } endShiftSaved.value={...endShiftSaved.value,3:true}; endShiftStep.value=4; error.value=''; message.value='' }
const endShiftReviewSkip = () => { endShiftSaved.value={...endShiftSaved.value,3:true}; endShiftStep.value=4; error.value=''; message.value='' }
const endShiftConfirm = async () => { reviewTrips.value=true; await goOffline() }
const endShiftCanSwipeForward = computed(() => endShiftStep.value === 1 ? endShiftSaved.value[1] : endShiftStep.value < 4)
const endShiftSwipeStyle = computed(() => ({ '--end-shift-card-offset': `${endShiftSwipeOffset.value}px`, '--end-shift-card-rotate': `${Math.max(-4,Math.min(4,endShiftSwipeOffset.value / 70))}deg` }))
const endShiftFieldValue = field => field === 'closingOdo' ? closingOdo.value : field === 'shiftRevenue' ? shiftRevenue.value : field === 'toll' ? toll.value : field === 'parking' ? parking.value : ''
const setEndShiftFieldValue = (field, value) => { if(field === 'closingOdo') closingOdo.value=value; else if(field === 'shiftRevenue') shiftRevenue.value=value; else if(field === 'toll') toll.value=value; else if(field === 'parking') parking.value=value }
const openEndShiftKeypad = field => { endShiftActiveField.value=field; endShiftKeypadVisible.value=true }
const closeEndShiftKeypad = () => { endShiftActiveField.value=null; endShiftKeypadVisible.value=false }
const endShiftKeypadPress = key => { const field=endShiftActiveField.value; if(!field)return; let value=String(endShiftFieldValue(field)??''); if(key==='backspace')value=value.slice(0,-1); else if(key==='clear')value=''; else if(/^\d$/.test(key)){ if(value==='0')value=key; else if(value.length<10)value+=key } setEndShiftFieldValue(field,value) }
const endShiftNavigateForward = () => { if(endShiftStep.value>=4)return; if(endShiftStep.value===1&&!endShiftSaved.value[1])return fail('Save the odometer and revenue before continuing.'); closeEndShiftKeypad(); if(endShiftStep.value===2)endShiftExpenseSkip(); else if(endShiftStep.value===3)endShiftReviewSkip() }
const endShiftNavigateBack = () => { if(endShiftStep.value<=1)return; closeEndShiftKeypad(); endShiftStep.value-=1; error.value=''; message.value='' }
const onEndShiftSwipeStart = event => { if(event.pointerType==='mouse'&&event.button!==0)return; if(event.target.closest?.('button,input,select,label,a'))return; endShiftSwipeStartX.value=event.clientX; endShiftSwipeTracking.value=true; endShiftSwipeOffset.value=0; event.currentTarget.setPointerCapture?.(event.pointerId) }
const onEndShiftSwipeMove = event => { if(!endShiftSwipeTracking.value||endShiftSwipeStartX.value==null)return; const distance=event.clientX-endShiftSwipeStartX.value; const max=Math.max(90,(event.currentTarget.clientWidth||320)*0.82); endShiftSwipeOffset.value=Math.max(-max,Math.min(distance,max)) }
const onEndShiftSwipeEnd = event => { if(!endShiftSwipeTracking.value||endShiftSwipeStartX.value==null)return; const distance=event.clientX-endShiftSwipeStartX.value; const width=event.currentTarget.clientWidth||320; const trigger=Math.max(80,width*0.28); endShiftSwipeTracking.value=false; endShiftSwipeStartX.value=null; if(Math.abs(distance)<trigger){endShiftSwipeOffset.value=0;return} endShiftSwipeOffset.value=distance>0?width+80:-(width+80); window.setTimeout(()=>{endShiftSwipeOffset.value=0; if(distance>0)endShiftNavigateForward(); else endShiftNavigateBack()},180) }
const onEndShiftSwipeCancel = () => { endShiftSwipeTracking.value=false; endShiftSwipeStartX.value=null; endShiftSwipeOffset.value=0 }
const toggleOnline = async () => { if(store.isTripActive)return fail('End the active Trip before going Offline.'); if(store.isOnline){ openEndShift(); return } startOdoOpen.value=true; startOdo.value=store.lastKnownOdometer??''; gapCategory.value=null; error.value=''; message.value='' }
const cancelStartOdo = () => { startOdoOpen.value=false; startOdo.value=''; gapCategory.value=null; error.value=''; message.value='' }
const cancelOffline = () => { endShiftOpen.value = false; endShiftStep.value=1; error.value = ''; notify('Still Online — End Shift cancelled.') }
const saveFuelDraft = () => { const draft={savedAt:Date.now(),clientMutationId:fuelClientMutationId.value,odometer:fuelOdometer.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value}; if(draft.odometer||draft.pricePerKg||draft.amount) sessionStorage.setItem(fuelDraftKey,JSON.stringify(draft)); else sessionStorage.removeItem(fuelDraftKey) }
const loadFuelDraft = () => { try { const draft=JSON.parse(sessionStorage.getItem(fuelDraftKey)||'null'); if(!draft || Date.now()-Number(draft.savedAt||0)>fuelDraftTtlMs){sessionStorage.removeItem(fuelDraftKey); fuelClientMutationId.value=crypto.randomUUID(); return} fuelClientMutationId.value=draft.clientMutationId||crypto.randomUUID(); fuelOdometer.value=draft.odometer||''; fuelPrice.value=draft.pricePerKg||''; fuelAmount.value=draft.amount||'' } catch(_) {} }
const openFuelForm = () => { fuelFormOpen.value = !fuelFormOpen.value; if (fuelFormOpen.value) { endShiftOpen.value=false; if(!fuelClientMutationId.value) fuelClientMutationId.value=crypto.randomUUID(); loadFuelDraft() } else saveFuelDraft(); error.value=''; message.value='' }
const closeFuelForm = () => { saveFuelDraft(); fuelFormOpen.value=false; error.value=''; message.value='' }
const changeTripOperator = async operator => { if(!store.isTripActive){selectedOperator.value=operator;operatorMenuOpen.value=false;return} if(operator===store.trip.operator){operatorMenuOpen.value=false;return} const result=await store.updateTrip({id:store.trip.id,operator}); if(!result.ok)return fail(result.reason); selectedOperator.value=operator; operatorMenuOpen.value=false; notify(`Operator changed to ${operator}.`) }
const startGoingToPickup = () => { if (store.isTripActive || goingToPickup.value) return; goingToPickup.value=true; pickupGpsPoints.value=0; pickupGpsSummary.value=DeadKmPickupGpsService.getTestSummary(); const started=DeadKmPickupGpsService.start((_point,count)=>{ pickupGpsPoints.value=count; pickupGpsSummary.value=DeadKmPickupGpsService.getTestSummary() }); if(!started){ goingToPickup.value=false; return fail('GPS permission is required to measure Dead KM on the way to pickup.') } notify('Going to pickup — Dead KM GPS measuring started.') }
const startTrip = async () => { const result=await store.startTrip(selectedOperator.value||store.defaultOperator); if(!result.ok)return fail(result.reason); DeadKmPickupGpsService.stop(); goingToPickup.value=false; pickupGpsPoints.value=DeadKmPickupGpsService.getPointCount(); pickupGpsSummary.value=DeadKmPickupGpsService.getTestSummary(); selectedOperator.value=result.trip.operator; notify('Trip started. Pickup GPS measuring stopped.') }
const endTrip = async () => { if(await store.endTrip()){ await refreshTarget(); notify('Trip completed.') } }
const cancelAccidentalTrip = async () => { if(!confirm('Cancel this accidental trip? It will be recorded as a cancelled driver-mistake trip.'))return; if(await store.cancelTrip({reason:'DRIVER_MISTAKE'})){await refreshTarget();notify('Accidental trip cancelled.')} }
const cancelTripWithRevenue = async () => { if(!confirm('Record this trip as cancelled? Optional revenue will be retained if entered.'))return; if(await store.cancelTrip({reason:cancelReason.value,revenue:cancelledRevenue.value})){cancelledRevenue.value='';cancelPanel.value=false;await refreshTarget();notify('Cancelled trip recorded.')} }
const saveFuel = async () => { if (fuelStore.saving) return; const result=await fuelStore.save({odometer:fuelOdometer.value,pricePerKg:fuelPrice.value,amount:fuelAmount.value,clientMutationId:fuelClientMutationId.value}); if(!result.ok)return fail(result.reason); fuelOdometer.value='';fuelPrice.value='';fuelAmount.value='';fuelClientMutationId.value=crypto.randomUUID();sessionStorage.removeItem(fuelDraftKey);fuelFormOpen.value=false;notify(`Refuelling recorded: ${result.record.quantityKg.toFixed(2)} kg.`) }
const primaryTripAction = () => { if (store.isTripActive) return endTrip(); if (!goingToPickup.value) return startGoingToPickup(); return startTrip() }
const tripActionLabel = computed(() => store.isTripActive ? 'SWIPE → END TRIP' : goingToPickup.value ? 'SWIPE → START TRIP' : 'SWIPE → GO TO PICKUP')
const tripActionHint = computed(() => store.isTripActive ? 'Swipe from left to right to end this trip' : goingToPickup.value ? 'Swipe when you reach pickup — starts the trip and stops high-frequency GPS' : 'Swipe to confirm Going to Pickup and start Dead KM GPS measuring')
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
onMounted(async()=>{await store.initialize();await fuelStore.refresh();await refreshTarget();await refreshPerformance();startOdo.value=store.lastKnownOdometer??'';selectedOperator.value=store.defaultOperator;loadFuelDraft();unsubscribeTarget=DriverTargetService.subscribeDataChanges(()=>{void refreshTarget();void refreshPerformance()});interval=window.setInterval(()=>{clock.value=Date.now()},1000)})
onUnmounted(()=>{window.clearInterval(interval);unsubscribeTarget?.();DeadKmPickupGpsService.reset()})
</script>

<template>
  <div class="cockpit kfe-work-cockpit" :class="{ 'cockpit--offline': !store.isOnline, 'cockpit--online': store.isOnline && !store.isTripActive && !endShiftOpen, 'cockpit--trip': store.isTripActive, 'cockpit--end-shift': endShiftOpen, 'cockpit--fuel': fuelFormOpen }">
    <header class="hero">
      <div><small>KFE WORK</small><h1>Driver Cockpit</h1></div>
      <div class="hero-actions"><button class="fuel-icon" type="button" :class="{active:fuelFormOpen}" aria-label="CNG refuelling" title="CNG refuelling" @click="openFuelForm"><span aria-hidden="true">⛽</span></button><div class="online-control"><span>OFFLINE</span><button type="button" class="online-toggle" :class="{active:store.isOnline}" :disabled="store.isTripActive" role="switch" :aria-checked="store.isOnline" :aria-label="store.isOnline ? 'Go Offline' : 'Confirm odometer and go Online'" @click.stop.prevent="toggleOnline"><span/></button><span>ONLINE</span></div></div>
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
      <div v-if="!startOdoOpen" class="offline-performance">
        <button class="work-target-tab" type="button" aria-label="Today's target"><span>TARGET</span><strong>{{targetText}}</strong></button>
        <article class="work-performance-hero work-performance-week">
          <div class="work-performance-heading"><div><small>WEEKLY PERFORMANCE</small><h3>{{weeklyPerformance?.date || 'This week'}}</h3></div><span>WEEK</span></div>
          <div class="work-performance-metrics">
            <div><span>Revenue</span><strong>{{performanceMoney(weeklyPerformance?.revenue)}}</strong><small>Total fare · toll + parking</small></div>
            <div><span>Profit</span><strong>{{performanceMoney(weeklyPerformance?.profit)}}</strong><small>Revenue − break-even</small></div>
          </div>
        </article>
        <article class="work-performance-hero work-performance-yesterday">
          <div class="work-performance-heading"><div><small>YESTERDAY'S PERFORMANCE</small><h3>{{yesterdayPerformance?.date || 'Yesterday'}}</h3></div><span>DAY</span></div>
          <div class="work-performance-metrics">
            <div><span>Revenue</span><strong>{{performanceMoney(yesterdayPerformance?.revenue)}}</strong><small>Total fare · toll + parking</small></div>
            <div><span>Profit</span><strong>{{performanceMoney(yesterdayPerformance?.profit)}}</strong><small>Revenue − break-even</small></div>
          </div>
        </article>
      </div>
      <div v-if="startOdoOpen" class="focus-card start-odo-confirm">
        <div class="form-topline"><div><small>SHIFT START</small><h3>START ODOMETER</h3></div><button class="form-back" type="button" @click="cancelStartOdo"><span aria-hidden="true">🔙</span><span>Back</span></button></div>
        <input v-model="startOdo" type="number" min="0" inputmode="decimal" aria-label="Start odometer" autocomplete="off">
        <span class="field-note">Pre-filled from last valid entry · check and confirm</span>
        <button class="primary start-online-action" type="button" @click="goOnline">CONFIRM ODOMETER &amp; GO ONLINE</button>
        <div v-if="store.firstKfeDay && gap.valid" class="gap compact-gap"><div class="gap-head"><strong>Historical odometer gap</strong><span>Excluded from Personal / Dead KM</span></div><div class="allocation-summary"><div><span>Business start</span><strong>{{store.businessStartBaseline?.businessStartOdometer ?? '—'}} km</strong></div><div><span>Current</span><strong>{{startOdo || '—'}} km</strong></div></div></div>
        <div v-else-if="gap.valid&&gapKm>0" class="gap compact-gap"><div class="gap-head"><strong>Odometer gap · {{gapKm}} km</strong><span>Resolve before Online</span></div><div class="allocation-actions"><button type="button" :class="{selected:gapCategory==='PERSONAL'}" @click="selectGapCategory('PERSONAL')">Personal KM</button><button type="button" :class="{selected:gapCategory==='DEAD'}" @click="selectGapCategory('DEAD')">Dead KM</button></div><div class="gap-status"><span v-if="gapCategory">Allocated {{allocatedGap}} / {{gapKm}} km · Ready for Online</span><span v-else>Choose one category before Online.</span></div></div>
      </div>
    </section>

    <section v-else-if="!store.isTripActive && store.isOnline && !endShiftOpen" class="cockpit-state cockpit-ready-state">
      <div class="state-kicker online">ONLINE</div>
      <h2>READY FOR NEXT TRIP</h2>
      <div class="ready-context"><div class="operator-inline"><span>Operator</span><button type="button" class="operator-select" @click="operatorMenuOpen=!operatorMenuOpen">{{(selectedOperator||store.defaultOperator)+' ▾'}}</button></div><div v-if="operatorMenuOpen" class="operator-menu"><button v-for="operator in store.operators" :key="operator" type="button" :class="{selected:(store.defaultOperator===operator&&selectedOperator!=='__menu__')}" @click="changeTripOperator(operator)">{{operator}}</button></div></div>
      <div class="target-inline"><span>TODAY'S TARGET</span><strong>{{targetText}}</strong></div>
      <div class="next-event"><span>NEXT</span><strong>START TRIP</strong></div>
    </section>

    <section v-else-if="goingToPickup && !endShiftOpen" class="cockpit-state cockpit-pickup-state">
      <div class="state-kicker pickup">GOING TO PICKUP</div>
      <h2>DEAD KM MEASURING</h2>
      <div class="pickup-gps-card">
        <div><span>GPS FREQUENCY</span><strong>~2 sec</strong></div>
        <div><span>POINTS CAPTURED</span><strong>{{pickupGpsPoints}}</strong></div>
        <div><span>POINT TEST</span><strong :class="{pass:pickupGpsSummary.passed}">{{pickupGpsSummary.passed ? 'PASS' : 'COLLECTING'}}</strong></div>
      </div>
      <p class="pickup-gps-note">High-frequency GPS records the movement to pickup. Passenger trip KM remains operator-entered. GPS stops when you start the trip.</p>
      <div class="pickup-location-status"><span>GPS</span><strong>{{pickupGpsPoints > 0 ? 'Measuring' : 'Waiting for fix…'}}</strong></div>
    </section>

    <section v-if="store.isTripActive && !endShiftOpen" class="cockpit-state cockpit-trip-state">
      <div class="state-kicker online">ON TRIP</div>
      <div class="trip-operator-row"><span>Operator</span><button type="button" class="operator-select" @click="selectedOperator = selectedOperator === '__menu__' ? store.trip.operator : '__menu__'">{{store.trip.operator+' ▾'}}</button></div>
      <div v-if="selectedOperator==='__menu__'" class="operator-menu"><button v-for="operator in store.operators" :key="operator" type="button" :class="{selected:store.trip.operator===operator}" @click="changeTripOperator(operator)">{{operator}}</button></div>
      <div class="trip-target"><span>TODAY'S TARGET</span><strong>{{targetText}}</strong></div>
      <div class="trip-core"><div class="timer">{{tripTimer}}</div><div class="trip-continuity">Trip in progress · operator can be corrected before trip ends</div></div>
      <div class="next-event"><span>NEXT</span><strong>END TRIP</strong></div>
    </section>

    <section v-if="endShiftOpen" class="cockpit-state cockpit-end-state" :style="endShiftSwipeStyle" :class="{'is-card-dragging':endShiftSwipeTracking}" @pointerdown="onEndShiftSwipeStart" @pointermove="onEndShiftSwipeMove" @pointerup="onEndShiftSwipeEnd" @pointercancel="onEndShiftSwipeCancel">
      <div class="form-topline"><div><div class="state-kicker">GOING OFFLINE</div><h2>{{endShiftStep===1?'CLOSE SHIFT':endShiftStep===2?'SHIFT EXPENSES':endShiftStep===3?'RIDE REVIEW':'CONFIRM END SHIFT'}}</h2></div><button class="form-back" type="button" @click="endShiftBack"><span aria-hidden="true">🔙</span><span>Back</span></button></div>

      <div v-if="endShiftStep===1" class="end-form-body end-entry-grid">
        <div class="start-odo-reference"><span>Shift started</span><strong>{{store.startOdometer ?? '—'}} km</strong></div>
        <div class="metric-field">
          <label for="closing-odometer">CLOSING ODOMETER</label>
          <div class="metric-input"><input id="closing-odometer"  :value="closingOdo" type="text" inputmode="none" readonly placeholder="0" aria-label="Closing odometer" @click="openEndShiftKeypad('closingOdo')"><span>km</span></div>
          <small>Current vehicle reading</small>
        </div>
        <div class="metric-field">
          <label for="shift-revenue">TOTAL SHIFT REVENUE</label>
          <div class="metric-input"><span>₹</span><input id="shift-revenue"  :value="shiftRevenue" type="text" inputmode="none" readonly placeholder="0" aria-label="Total shift revenue" @click="openEndShiftKeypad('shiftRevenue')"></div>
          <small>Revenue recorded for this shift</small>
        </div>
      </div>

      <div v-else-if="endShiftStep===2" class="end-form-body optional-entry">
        <div class="optional-heading"><div><p class="form-question">SHIFT EXPENSES</p><p class="muted">Optional — add only what applies.</p></div><span>SKIPPABLE</span></div>
        <div class="expense-grid">
          <div class="metric-field compact"><label for="shift-toll">TOLL</label><div class="metric-input"><span>₹</span><input id="shift-toll"  :value="toll" type="text" inputmode="none" readonly placeholder="0" aria-label="Toll" @click="openEndShiftKeypad('toll')"></div></div>
          <div class="metric-field compact"><label for="shift-parking">PARKING</label><div class="metric-input"><span>₹</span><input id="shift-parking"  :value="parking" type="text" inputmode="none" readonly placeholder="0" aria-label="Parking" @click="openEndShiftKeypad('parking')"></div></div>
        </div>
        <label class="exclude-check"><input v-model="tollTreatment" true-value="EXCLUDED" false-value="INCLUDED" type="checkbox"><span>Exclude toll &amp; parking from trip fare</span></label>
      </div>

      <div v-else-if="endShiftStep===3" class="end-form-body optional-entry">
        <div class="optional-heading"><div><p class="form-question">REVIEW RIDES</p><p class="muted">Optional — correct anything that needs attention.</p></div><span>SKIPPABLE</span></div>
        <div class="reviews compact-reviews"><p v-if="!store.completedTrips.length" class="muted">No completed trips.</p><div v-for="t in store.completedTrips" :key="t.id" class="review"><select v-model="t.operator" aria-label="Trip operator"><option v-for="operator in store.operators" :key="operator">{{operator}}</option></select><input v-model="t.tripKm" type="number" min="0" step="0.1" placeholder="KM"><input v-model="t.revenue" type="number" min="0" step="0.01" placeholder="₹"></div></div>
      </div>

      <div v-else class="end-form-body end-confirm-panel">
        <div class="end-confirm-summary"><span>Everything is ready.</span><strong>END SHIFT</strong><small>All saved steps are ready to close the shift.</small></div>
      </div>

      <div v-if="endShiftKeypadVisible && endShiftStep<4" class="kfe-number-pad" aria-label="KFE number pad">
        <div class="number-pad-display"><span>{{endShiftActiveField==='closingOdo'?'CLOSING ODOMETER':endShiftActiveField==='shiftRevenue'?'TOTAL SHIFT REVENUE':endShiftActiveField==='toll'?'TOLL':'PARKING'}}</span><strong>{{endShiftActiveField==='closingOdo'?'':'₹'}}{{endShiftFieldValue(endShiftActiveField)||'0'}}<small v-if="endShiftActiveField==='closingOdo'"> km</small></strong></div>
        <div class="number-pad-grid"><button v-for="key in ['1','2','3','4','5','6','7','8','9','clear','0','backspace']" :key="key" type="button" @pointerdown.stop.prevent="endShiftKeypadPress(key)"><span v-if="key==='backspace'">⌫</span><span v-else-if="key==='clear'">C</span><span v-else>{{key}}</span></button></div>
        <button class="number-pad-done" type="button" @click="closeEndShiftKeypad">DONE</button>
      </div>
      <div v-if="endShiftStep<4" class="form-actions end-actions">
        <template v-if="endShiftStep===1"><button class="primary" type="button" @click="endShiftContinue">CONTINUE →</button></template>
        <template v-else-if="endShiftStep===2"><button class="secondary" type="button" @click="endShiftExpenseSave">SAVE</button><button class="primary skip-dominant" type="button" @click="endShiftExpenseSkip">SKIP →</button></template>
        <template v-else><button class="secondary" type="button" @click="endShiftReviewSave">SAVE</button><button class="primary skip-dominant" type="button" @click="endShiftReviewSkip">SKIP →</button></template>
      </div>
      <div v-else class="end-confirm-actions">
        <button class="primary end-confirm-button" type="button" @click="endShiftConfirm">OK — END SHIFT</button>
      </div>
    </section>

    <div v-if="store.isOnline && !endShiftOpen && !fuelFormOpen" class="persistent-action">
      <div ref="swipeTrack" class="swipe-bar trip-action" :class="{ 'swipe-bar--start': !store.isTripActive, 'swipe-bar--end': store.isTripActive, 'is-swiping': swipeTracking, 'is-threshold': swipeProgress >= 80 }" :style="swipeStyle" role="button" tabindex="0" aria-label="Swipe from left to right to start or end the current trip" @pointerdown="onSwipeStart" @pointermove="onSwipeMove" @pointerup="onSwipeEnd" @pointercancel="onSwipeCancel" @pointerleave="onSwipeEnd" @keydown="onSwipeKey">
        <span class="swipe-progress" aria-hidden="true"></span><span class="swipe-threshold" aria-hidden="true"><i></i><em>80%</em></span><span class="swipe-label">{{tripActionLabel}}</span><span class="swipe-thumb" aria-hidden="true"><b>→</b></span>
      </div><small class="swipe-hint">{{swipeTracking ? (swipeProgress >= 80 ? 'RELEASE TO CONFIRM' : 'KEEP SWIPING →') : tripActionHint}}</small>
    </div>
  </div>
</template>